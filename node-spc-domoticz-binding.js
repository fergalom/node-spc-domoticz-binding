#!/usr/bin/env node
/*
* Binding between SPC Web Gateway and Domoticz
*/
/* Accept self signed certificate */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

var config = require('./config.json');

// SPC Websocket Client
var ws_client = require('websocket').client;
var spc_ws_client = new ws_client();

// SPC Http Client
var digest = require('./lib/http-digest-client');
var spc_http_client = digest.createClient(config.spc_get_user, config.spc_get_password, true);

// Domoticz Http Client
var hc2_http_client = require('http');

// Update Domoticz with current SPC Areas and Zones status
getSpcStatus('area', handleSpcAreaData);
getSpcStatus('zone', handleSpcZoneData);

// Listen on events from SPC
spc_ws_client.connect('wss://' + config.spc_gw_host + ':' + config.spc_gw_port + '/ws/spc?username=' + config.spc_ws_user + '&password=' + config.spc_ws_password);

spc_ws_client.on('connectFailed', function(error) {
    console.log('Connect Error: ' + error.toString());
});

spc_ws_client.on('connect', function(connection) {
    console.log('SPC WebSocket client connected');

    connection.on('error', function(error) {
        console.log("Connection Error: " + error.toString());
    });
    connection.on('close', function() {
        console.log('echo-protocol Connection Closed');
    });
    connection.on('message', function(message) {
        if (message.type === 'utf8') {
            manageSiaEvent(message.utf8Data);
        }
    });
});

/**********************************************************************
* setDomoticzUserVariable  
**********************************************************************/

function setDomoticzVariable(globalVariableHC2, value){
/*
 http://192.168.1.16:8080/json.htm?type=command&param=udevice&idx=$idx&nvalue=0&svalue=79
 
 http://192.168.1.16:8080/json.htm?type=command&param=saveuservariable&vname=test2&vtype=2&vvalue=testing
 Where type is 0 to 4:
0 = Integer, e.g. -1, 1, 0, 2, 10 
1 = Float, e.g. -1.1, 1.2, 3.1
2 = String
3 = Date in format DD/MM/YYYY
4 = Time in 24 hr format HH:MM

Update an existing variable
/json.htm?type=command&param=updateuservariable&idx=idx&vname=uservariablename&vtype=uservariabletype&vvalue=uservariablevalue
List all variables
/json.htm?type=command&param=getuservariables
List one variable:
/json.htm?type=command&param=getuservariable&idx=IDX
Delete a variable
/json.htm?type=command&param=deleteuservariable&idx=IDX

*/

 var options = {
        hostname: config.domo_host,
        port: 8080,
        path: '/json.htm?type=command&param=updateuservariable&vname=' + globalVariableHC2 + '&vtype=2&vvalue=' + value,
        /*auth: config.hc2_user + ':' + config.hc2_password + '@',*/
        method: 'PUT'
    }
    var req = hc2_http_client.request(options, function(res) {
        
        var reply = '';
        res.on('data', function(chunk) {
            reply += chunk;
        });
        res.on('end', function(){
        
		var replyobj = null;
        console.log(reply);
            try {
                replyobj = JSON.parse(reply);

                if (replyobj.status == 'ERR') {   /* Create variable if not found */
                    createDomoticzVariable(globalVariableHC2, value);
                }

            } catch (e) {
                console.log('Failed to parse reply, expected JSON');
            }
        });
    }).on('error', function(e) {
        console.log('Error: ' + e.message);
    });
    req.write(JSON.stringify(value));
    req.end();
}

/**********************************************************************
* createDomoticzVariable  
**********************************************************************/
function createDomoticzVariable(globalVariableHC2, value){

    var options = {
        hostname: config.domo_host,
        port: 8080,
        path: '/json.htm?type=command&param=saveuservariable&vname=' + globalVariableHC2 + '&vtype=2&vvalue=' + value,
        /*auth: config.hc2_user + ':' + config.hc2_password + '@',*/
        method: 'POST'
    }
    var req = hc2_http_client.request(options, function(res) {
        var reply = '';
        res.on('data', function(chunk) {
            reply += chunk;
        });
        res.on('end', function(){
            console.log(reply);
        });
    }).on('error', function(e) {
        console.log('Error: ' + e.message);
    });
    req.write(JSON.stringify(data));
    req.end();
}


/**********************************************************************
* handleSpcAreaData
**********************************************************************/
function handleSpcAreaData(data) {

    data.area.forEach(function(area) {
        var area_mode = "unknown";

        switch (parseInt(area.mode)) {
            case 0:
                area_mode = "unset";
                break;
            case 1:
                area_mode = "partset_a";
                break;
            case 2:
                area_mode = "partset_b";
                break;
            case 3:
                area_mode = "set";
                break;
        }

        var modeVariableHC2 = 'G_SPC_AREA_MODE_' + area.name;

        setDomoticzVariable(modeVariableHC2, area_mode);
    });
}
/**********************************************************************
* handleSpcZoneData
**********************************************************************/
function handleSpcZoneData(data) {
    data.zone.forEach(function(zone) {

        if (zone.input != undefined) {
            var zone_input = "unknown";
            switch (parseInt(zone.input)) {
                case 0:
                    zone_input = "closed";
                    break;
                case 1:
                    zone_input = "open";
                    break;
                case 2:
                    zone_input = "short";
                    break;
                case 3:
                    zone_input = "disconnected";
                    break;
                case 4:
                    zone_input = "pir_masked";
                    break;
                case 5:
                    zone_input = "dc_substitution";
                    break;
                case 6:
                    zone_input = "sensor_missing";
                    break;
                case 7:
                    zone_input = "offline";
                    break;
            }
            var inputVariableHC2 = 'G_SPC_ZONE_INPUT_' + zone.zone_name;

            setDomoticzVariable(inputVariableHC2, zone_input);
        }

        if (zone.status != undefined) {
            var zone_status = "unknown";
            switch (parseInt(zone.status)) {
                case 0:
                    zone_status = "ok";
                    break;
                case 1:
                    zone_status = "inhibit";
                    break;
                case 2:
                    zone_status = "isolate";
                    break;
                case 3:
                    zone_status = "soak";
                    break;
                case 4:
                    zone_status = "tamper";
                    break;
                case 5:
                    zone_status = "alarm";
                    break;
                case 6:
                    zone_status = "ok";
                    break;
                case 7:
                    zone_status = "trouble";
                    break;
            }

            var statusVariableHC2 = 'G_SPC_ZONE_STATUS_' + zone.zone_name;

            setDomoticzVariable(statusVariableHC2, zone_status);
        }
    });
}
/**********************************************************************
* getSpcStatus
**********************************************************************/
function getSpcStatus(uri, callback) {
    var options = {
        host: config.spc_gw_host,
        port: config.spc_gw_port,
        path: '/spc/' + uri,
        method: 'GET'
    }
    var reply = "";

    var req = spc_http_client.request(options, function(res) {
        res.setEncoding('utf8');
        res.on('data', function(chunk){
            reply += chunk;
        });
        res.on('end', function(){
            var data = JSON.parse(reply);
            if (data.status === 'success'){
               callback && callback(data.data);
            }
            else {
               console.log("Unable to get data from SPC: " + uri);
            }
        });
    });
}
/**********************************************************************
* manageSiaEvent
**********************************************************************/
function manageSiaEvent(message){
    data = JSON.parse(message);
    if (data.status === 'success'){ 
        var sia = data.data.sia;
        sia_code    = sia.sia_code;
        sia_address = sia.sia_address;

        // Update status dependent on type of SIA event
        switch (sia_code){
            case 'BA': /* Burglar Alarm */
            case 'BR': /* Burglar Alarm Restore */
                getSpcStatus('area', handleSpcAreaData);
                getSpcStatus('zone', handleSpcZoneData);
                break;
            case 'BB': /* Inhibited or Isolated */
            case 'BU': /* Deinhibited or Deisolated */
                getSpcStatus('zone', handleSpcZoneData);
                break;
            case 'CL': /* Area Activated (Full Set) */
            case 'NL': /* Area Activated (Part Set)  */
            case 'OP': /* Area Deactivated */
                getSpcStatus('area', handleSpcAreaData);
                break;
            case 'ZC': /* Zone Closed */
            case 'ZO': /* Zone Opened */
                var value = (sia_code == 'ZC') ? 0:1;
                var data = {
                    zone: [
                        {
                            id: sia_address,
                            input: value
                        }
                    ]
                }
                handleSpcZoneData(data);
                break;
        }
    }
}
