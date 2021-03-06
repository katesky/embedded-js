﻿"use strict";

var cdwgapi = window.cdwgapi = window.cdwgapi || {};
cdwgapi._bs = new Date().getTime();
(function cdwloader() {
    var server = document.querySelector('script[src$="bootstrap.js"]').getAttribute('src');
    var name = server.split('/').pop();
    server = server.replace('/js/' + name, "");

    var action = "/api/payment";
    var api = new ApiModule(server, action);
    var main = function () {
        api.loadForm();
    }

    if (window.jQuery === undefined || window.jQuery.fn.jquery !== '3.1.1') {
        api.loadScript('https://cdnjs.cloudflare.com/ajax/libs/jquery/3.1.1/jquery.min.js', function () {
            api.setjQuery(window.jQuery);
            main();
        });
    } else {
        api.setjQuery(window.jQuery);
        main();
    }
})();

function ApiModule(server, action) {
    cdwgapi.sumbitForm = submitForm;
    var authorizing = false;
    var error = '';
    var creditCardDom;
    var $container;
    var jQuery = {};

    var years = [];
    var today = new Date().getFullYear();
    for (var i = today; i <= today + 10; i++) years.push(i);
    var controls = [
        { Name: 'Number', Lable: 'Credit Card Number', Type: "input", Validation: { Type: "numbers", Length: 12, MaxLength: -1 } },
        { Name: 'Name', Lable: 'Full Name', Type: "input", Validation: { Type: "any", Length: 3, MaxLength: -1 } },
        { Name: 'ExpirationMonth', Lable: 'MM/YYYY', Type: "combo", Values: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'], Validation: { Type: "numbers", Length: 1, MaxLength: -1 } },
        { Name: 'ExpirationYear', Lable: '', Type: "combo", Values: years, Validation: { Type: "numbers", Length: 3, MaxLength: -1 } },
        { Name: 'CVV', Lable: 'CVV', Type: "input", Validation: { Type: "numbers", Length: 2, MaxLength: 5 } }
    ];

    var builder = new RequestBuilder(server, action);
    var request = builder.process();

    var api = {
        setjQuery: function (jquery) {
            jQuery = jquery;
        }
    }
    api.loadScript = function (src, callback) {
        var js = document.createElement('script');
        js.src = src;
        js.type = 'text/javascript';

        if (typeof callback === 'function') {
            js.addEventListener('load', callback);
        }
        document.body.appendChild(js);
    }

    api.loadForm = function loadForm() {
        jQuery(document).ready(function ($) {
            $container = $("#" + request.element);

            cssLoader.init($, request);

            if (isRequestValid()) {
                addFormElements();
                return;
            }
            $container.append('<hr/><h3>CDW Form can not be used </h3><p>' + error + '</p>');
        });
    }

    function addFormElements() {
        var btnId = 'cdw_btn';

        //add box
        var box = '<div class="cdw_form"></div>';
        $container.append(box);
        var $box = $(".cdw_form");
        // $box.append('<hr/><h3>CDW Form:</h3><hr/>');

        //add conrols to box
        for (var i = 0; i < controls.length; i++) {
            var ctr = domControlsLoader.initControl(controls[i]);
            $box.append(ctr);
            if (controls[i].Validation.Type != "numbers") {
                continue;
            }
            $("#cdw_" + controls[i].Name).keydown(function (e) {
                // Allow: backspace, delete, tab, escape, enter and .
                if ($.inArray(e.keyCode, [46, 8, 9, 27, 13, 110, 190]) !== -1 ||
                    // Allow: Ctrl+A, Command+A
                    (e.keyCode === 65 && (e.ctrlKey === true || e.metaKey === true)) ||
                    // Allow: home, end, left, right, down, up
                    (e.keyCode >= 35 && e.keyCode <= 40)) {
                    // let it happen, don't do anything
                    return;
                }
                // Ensure that it is a number and stop the keypress
                if ((e.shiftKey || (e.keyCode < 48 || e.keyCode > 57)) && (e.keyCode < 96 || e.keyCode > 105) || ($(this).val().length > $(this).attr('maxlength'))) {
                    e.preventDefault();
                }
            });
        }
        //add button to box
        if (!request.hidebutton) {
            $box.append('<div><input id=' + btnId + ' type="button" class="cdw_button" value="Validate"></div>');

            $("#" + btnId).on('click', submitForm);
            $('body').keyup(function (event) {
                if (event.keyCode === 13) {
                    submitForm();
                }
            });
        } else //or use partner's button
        {
            if ($("#" + request.partnerbutton)) {
                $("#" + request.partnerbutton).on('click', submitForm);
            }
        }
        $box.append('<div class="cdw_validations"></div>');
        //get all controls for later
        creditCardDom = domControlsLoader.creditCardDom(controls);
    }

    function submitForm() {
        return new Promise((resolve, reject) => {
            if (authorizing) {
                reject("Loading previous request");
                return;
            }
            $(".cdw_validations").hide();
            $(".cdw_validations").html('');
            //validate input
            var isvalid = domValidator.process(creditCardDom, controls);

            //if invalid show it
            if (!isvalid) {
                reject($(".cdw_validations").html());
                return;
            }
            var cc = {};
            for (var i = 0; i < controls.length; i++) {
                cc[controls[i].Name] = $.trim(creditCardDom[i].val());
            }

            var data = {
                TransactionId: request.transactionId,
                UserAgent: navigator.userAgent,
                CreditCard: cc
            };

            if ($("#" + request.callbackelement).length > 0) {
                $("#" + request.callbackelement).html("loading");
            }
            authorizing = true;
            $.ajax({
                type: "POST",
                url: request.authorize,
                dataType: "json",
                contentType: "application/json; charset=utf-8",
                data: JSON.stringify(data),
                success: function (result) {
                    sendCallBack(result.referenceNumber);
                    resolve(result.referenceNumber);
                },
                error: function (err) {
                    if (err.status === 401) {
                        sendCallBack("Unauthorized");
                        reject("Unauthorized");
                        return;
                    }
                    if (err.status !== 400) {
                        sendCallBack("Error");
                        reject("Error");
                        return;
                    }
                    var data = err.responseJSON;
                    if (data === undefined) {
                        sendCallBack("Error");
                        reject("Error");
                        return;
                    }
                    var html = [];
                    for (var j = 0; j < data.length; j++) {
                        html.push(data[j].Message);
                    }
                    $(".cdw_validations").show();
                    $(".cdw_validations").html(html.join("<br>"));
                    if ($("#" + request.callbackelement).length > 0) {
                        $("#" + request.callbackelement).html("");
                    }
                    reject($(".cdw_validations").html());
                },
                complete: function () {
                    authorizing = false;
                },
                beforeSend: function (xhr) {
                  //  xhr.setRequestHeader('Authorization', 'Bearer ' + request.token);
                }
            });
        });
    }

    function isRequestValid() {
        //   return true;
        if (window.location.protocol !== "https:") {
            error = "can not be used over http";
            return false;
        }
        if (request.element === undefined || request.element.length <= 0) {
            error = "element needs to be provided as a ' data-element'";
            return false;
        }
        if (request.token === undefined || request.token.length <= 0) {
            error = "token needs to be provided as a 'data-key'";
            return false;
        }
        if (request.transactionId === undefined || request.transactionId.length <= 0) {
            error = "transactionId needs to be provided as a 'data-transaction-id'";
            return false;
        }
        if (request.hidebutton === "true") {//true
            request.hidebutton = true;
        }
        else if (request.hidebutton === "false" || request.hidebutton === undefined) {//false
            request.hidebutton = false;
        } else {//bad data
            request.hidebutton = false;
        }
        if (request.hidebutton === true && request.partnerbutton === undefined) {
            request.hidebutton = false;
        }
        return true;
    }

    function sendCallBack(msg) {
        if ($("#" + request.callbackelement).length > 0) {
            $("#" + request.callbackelement).html(msg);
        }
    }

    return api;
};

function RequestBuilder(server, action) {
    var _action = action;
    return {
        process: function _process() {
            var request = {};
            var scriptTag = document.querySelector('script[src$="bootstrap.js"]');
            request.token = scriptTag.getAttribute('data-key');
            request.client = scriptTag.getAttribute('data-name');
            request.element = scriptTag.getAttribute('data-element');
            request.callbackelement = scriptTag.getAttribute('data-callback-element');
            request.transactionId = scriptTag.getAttribute('data-transaction-id');
            request.hidebutton = scriptTag.getAttribute('data-no-button');
            request.partnerbutton = scriptTag.getAttribute('data-my-button');

            request.server = server;

            request.sitecss = request.server + "/css/site.css";
            request.authorize = request.server + _action;

            return request;
        }
    }
};

var cssLoader = (function () {
    return {
        init: function ($, request) {
            //$("<link>",
            //    {
            //        rel: "stylesheet",
            //        type: "text/css",
            //        href: request.bostrapcss
            //    }).appendTo('head');

            $("<link>",
                {
                    rel: "stylesheet",
                    type: "text/css",
                    href: request.sitecss
                }).appendTo('head');
        }
    }
})();

var domValidator = (function () {
    return {
        process: function _process(dom, controls) {
            //validate input
            var isvalid = true;
            var reg = new RegExp(/^\d+$/);
            var html = [];
            for (var i = 0; i < controls.length; i++) {
                var cc = controls[i];
                var value = dom[i].val();
                if (value.length === 0) {
                    html.push(cc.Name + " is required");
                    isvalid = false;
                    continue;
                }
                if (cc.Validation.Type === "numbers") {
                    if (!reg.test(value)) {
                        html.push(cc.Name + " must be a numeric");
                        isvalid = false;
                        continue;
                    }
                }
                if (cc.Validation.Length > 0) {
                    if (value.length < cc.Validation.Length) {
                        html.push(cc.Name + " must be > " + cc.Validation.Length);
                        isvalid = false;
                        continue;
                    }
                }
            }
            if (!isvalid) {
                $(".cdw_validations").html(html.join("<br>"))
                $(".cdw_validations").show();
            }

            return isvalid;
        }
    }
})();

var domControlsLoader = (function () {
    return {
        initControl: initControl,
        creditCardDom: creditCardDom
    }

    function creditCardDom(ids) {
        var obj = [];
        for (var i = 0; i < ids.length; i++) {
            obj[i] = $('#cdw_' + ids[i].Name);
        }
        return obj;
    }
    function initControl(control) {
        if (control.Type === 'combo') {
            return initComboBox(control.Name, control.Lable, control.Values);
        }
        if (control.Type === 'input') {
            return initInputBox(control);
        }
    }

    function initComboBox(controlName, label, values) {
        var id = "cdw_" + controlName;
        var className = "cdw_cc" + controlName;
        var options = "<option> </option>";
        for (var i = 0; i < values.length; i++) {
            options = options + ' <option value="' + values[i] + '">' + values[i] + '</option>';
        }
        var labelCtr = "";
        if (label.length > 0) {
            labelCtr = '<label class="cdw_label" for="' + id + '">' + label + '</label>';
        }
        var html =
            '<div class="form-group ' +
            className + '">' + labelCtr +
            '<select id=' + id + ' class=cdw_select >' + options + '</select>' +
            '<span class=" cdw_error cdw_padd cdw_val' + controlName + '">*</span>' +
            '</div>';
        return html;
    }

    function initInputBox(control) {
        var id = "cdw_" + control.Name;
        var className = "cdw_cc" + control.Name;
        var maxlength = '';
        if (control.Validation.MaxLength > 0) {
            maxlength = ' maxlength = "' + control.Validation.MaxLength + '" ';
        }
        var html =
            '<div class="form-group ' +
            className +
            '">' +
            '<label class="cdw_label" for="' + id + '">' + control.Lable + '</label>' +
            '<input type="text" class="cdw_input" id="' + id + '" placeholder="' + control.Lable + '"' + maxlength + ' required/> ' +
            '<span class="cdw_error cdw_val' + control.Name + '">*</span>' +
            '</div>';
        return html;
    }
})();