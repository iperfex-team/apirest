'use strict'

const LOG = process.env.LOG || false

var mysql = require('mysql')
var SimpleNodeLogger = require('simple-node-logger')
var log = SimpleNodeLogger.createSimpleLogger({ logFilePath:'/var/log/apirest.log', timestampFormat:'YYYY-MM-DD HH:mm:ss.SSS' })
var server = require('./server.js')
var tts = require('./tts.js')
var connection

var db = {
    host: server.host,
    port: server.port,
    user: server.user,
    password: server.pass,
    database: server.database,
    insecureAuth: true,
    connectionLimit: 10
}

function handleDisconnect() {
    connection = mysql.createConnection(db)

    connection.connect(function(err) {
        if(err) {
            console.log('error when connecting to db:', err)
            setTimeout(handleDisconnect, 2000)
        }
    })

    connection.on('error', function(err) {
        console.log('db error', err)
        if(err.code === 'PROTOCOL_CONNECTION_LOST') {
            handleDisconnect()
        }else{
            throw err
        }
    })
}

handleDisconnect()

function showip(req){
    var ip = (req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.socket.remoteAddress || req.connection.socket.remoteAddress).split(",")[0]
	return ip
}

exports.login = function(req,res){
    var username= req.body.user
    var password = req.body.pass
    var sql = "SELECT id, usuario AS user FROM api_usuario WHERE enabled = '1' AND usuario = ? AND md5_password = MD5(?) LIMIT 1"

    connection.query(sql, [[username], [password]], function (error, results, fields) {
        if (error) {
            res.status(200)
            var msglog = { code: '500', error: 'Problems with the query or connectivity to the db.' }
            var msgUser = { code: '500', error: 'Please contact the administrator' }
            if(LOG === 'true') log.error(`[${req.session.username}] [${showip(req)}] [${req.sessionID}] Method ${req.method.toUpperCase()}  Path: ${req.originalUrl} Body: `, req.body)
            if(LOG === 'true') log.error(`[${req.session.username}] [${showip(req)}] [${req.sessionID}] Status: ${msglog.code} Response: ${msglog.error}`)
            res.json(msgUser)
        }else{
            if(results.length >0){
                if(results[0].id){
                    req.session.user_id = results[0].id
                    req.session.username = results[0].user
                    req.session.isAuthed = true
                    connection.query('UPDATE api_usuario SET ultimo_login = NOW() WHERE id = ?', results[0].id)
                    res.status(200)
                    var msg = { code: 200, success: 'login sucessfull.' }
                    if(LOG === 'true') log.info(`[${req.session.username}] [${showip(req)}] [${req.sessionID}] Method ${req.method.toUpperCase()}  Path: ${req.originalUrl} Body: `, req.body)
                    if(LOG === 'true') log.info(`[${req.session.username}] [${showip(req)}] [${req.sessionID}] Status: ${msg.code} Response: ${msg.success}`)
                    res.json(msg)
                }else{
                    //Por aca no tendria que pasar nunca pero por las dudas.
                    req.session.isAuthed = false
                    res.status(200)
                    var msg = { code: '204', success: 'Invalid username and password does not match.' }
                    if(LOG === 'true') log.info(`[${req.body.user}] [${showip(req)}] [${req.sessionID}] Method ${req.method.toUpperCase()}  Path: ${req.originalUrl} Body: `, req.body)
                    if(LOG === 'true') log.info(`[${req.body.user}] [${showip(req)}] [${req.sessionID}] Status: ${msg.code} Response: ${msg.success}`)
                    res.json(msg)
                }
            }else{
                req.session.isAuthed = false
                res.status(200)
                var msg = { code: '204', success: 'Incorrect username and password.' }
                if(LOG === 'true') log.info(`[${req.body.user}] [${showip(req)}] [${req.sessionID}] Method ${req.method.toUpperCase()}  Path: ${req.originalUrl} Body: `, req.body)
                if(LOG === 'true') log.info(`[${req.body.user}] [${showip(req)}] [${req.sessionID}] Status: ${msg.code} Response: ${msg.success}`)
                res.json(msg)
            }
        }
    })
}

exports.campaigns = function(req,res){
    if(!req.session.isAuthed){
        res.status(200)
        var msg = { code: '204', success: 'Required login.' }
        if(LOG === 'true') log.info(`[anonymous] [${showip(req)}] [${req.sessionID}] Method ${req.method.toUpperCase()}  Path: ${req.originalUrl} Body: `, req.body)
        if(LOG === 'true') log.info(`[anonymous] [${showip(req)}] [${req.sessionID}] Status: ${msg.code} Response: ${msg.success}`)
        res.json(msg)
    }else{
        res.status(200)
        if(!req.params.id){
            var sql  = "SELECT c.id,c.name, c.max_canales AS channels, c.estatus AS status, c.id_survey, c.callerid, c.add_prefix, c.remove_prefix,(select description from iwebserver.campaign_schedule_header where id = c.call_time_template_id) as name_call_time, (select name from iwebserver.campaign_retry_header where id = c.reycling_template_id) as name_reciclado, IF(c.amdconf IS NULL,'OFF','ON') as amd_state from isurveyx.idialerx_campaign c inner join isurveyx.survey_header q on c.id_survey = q.id where q.creation_user_id = ?"
            var arg = [req.session.user_id]
        }else{
            var sql = "SELECT c.id,c.name, c.max_canales AS channels, c.estatus AS status, c.id_survey, c.callerid, c.add_prefix, c.remove_prefix,(select description from iwebserver.campaign_schedule_header where id = c.call_time_template_id) as name_call_time, (select name from iwebserver.campaign_retry_header where id = c.reycling_template_id) as name_reciclado, IF(c.amdconf IS NULL,'OFF','ON') as amd_state from isurveyx.idialerx_campaign c inner join isurveyx.survey_header q on c.id_survey = q.id where q.creation_user_id = ? and c.id = ?"
            var arg = [[req.session.user_id],[req.params.id]]
        }
        connection.query(sql, arg, function (error, results, fields) {
            if(error){
                res.status(200)
                var msglog = { code: '500', error: 'Problems with the query or connectivity to the db.' }
                var msgUser = { code: '500', error: 'Please contact the administrator' }
                if(LOG === 'true') log.error(`[${req.session.username}] [${showip(req)}] [${req.sessionID}] Method ${req.method.toUpperCase()}  Path: ${req.originalUrl} Body: `, req.body)
                if(LOG === 'true') log.error(`[${req.session.username}] [${showip(req)}] [${req.sessionID}] Status: ${msglog.code} Response: ${msglog.error}`)
                res.json(msgUser)
            }else{
                res.status(200)
                if(results.length > 0) {
                    var msg = { status: '200', response: results}
                    if(LOG === 'true') log.info(`[${req.session.username}] [${showip(req)}] [${req.sessionID}] Method ${req.method.toUpperCase()}  Path: ${req.originalUrl} Body: `, req.body)
                    if(LOG === 'true') log.info(`[${req.session.username}] [${showip(req)}] [${req.sessionID}] Status: ${msg.status} Response: `, results)
                    res.json(msg)
                }else{
                    var msg = { status: '200', response: 'No campaigns available.' }
                    if(LOG === 'true') log.info(`[${req.session.username}] [${showip(req)}] [${req.sessionID}] Method ${req.method.toUpperCase()}  Path: ${req.originalUrl} Body: `, req.body)
                    if(LOG === 'true') log.info(`[${req.session.username}] [${showip(req)}] [${req.sessionID}] Status: ${msg.status} Response: ${msg.response}`)
                    res.json(msg)
                }
            }
        })
    }
}

exports.campaignsStatus = function(req,res){
    if(!req.session.isAuthed){
        res.status(200)
        var msg = { code: '204', success: 'Required login.' }
        if(LOG === 'true') log.info(`[anonymous] [${showip(req)}] [${req.sessionID}] Method ${req.method.toUpperCase()}  Path: ${req.originalUrl} Body: `, req.body)
        if(LOG === 'true') log.info(`[anonymous] [${showip(req)}] [${req.sessionID}] Status: ${msg.code} Response: ${msg.success}`)
        res.json(msg)
    }else{
        res.status(200)
        if(req.params.status){
            var sql  = "SELECT estatus AS status, (SELECT COUNT(*) FROM idialerx_calls WHERE id_campaign = ?) AS LeadsUploaded, (SELECT COUNT(*) FROM idialerx_calls WHERE id_campaign = ? AND status IS NOT NULL) AS LeadsCalled FROM idialerx_campaign WHERE id = ?"
            var arg = [[req.params.id],[req.params.id],[req.params.id]]

            connection.query(sql, arg, function (error, results, fields) {
                if(error){
                    res.status(200)
                    var msglog = { code: '500', error: 'Problems with the query or connectivity to the db.' }
                    var msgUser = { code: '500', error: 'Please contact the administrator' }
                    if(LOG === 'true') log.error(`[${req.session.username}] [${showip(req)}] [${req.sessionID}] Method ${req.method.toUpperCase()}  Path: ${req.originalUrl} Body: `, req.body)
                    if(LOG === 'true') log.error(`[${req.session.username}] [${showip(req)}] [${req.sessionID}] Status: ${msglog.code} Response: ${msglog.error}`)
                    res.json(msgUser)
                }else{
                    res.status(200)
                    if(results.length > 0) {
                        var msg = { status: '200', response: results}
                        if(LOG === 'true') log.info(`[${req.session.username}] [${showip(req)}] [${req.sessionID}] Method ${req.method.toUpperCase()}  Path: ${req.originalUrl} Body: `, req.body)
                        if(LOG === 'true') log.info(`[${req.session.username}] [${showip(req)}] [${req.sessionID}] Status: ${msg.status} Response: `, results)
                        res.json(msg)
                    }else{
                        var msg = { code: '404', error: 'The incorrect campaign id.' }
                        if(LOG === 'true') log.info(`[${req.session.username}] [${showip(req)}] [${req.sessionID}] Method ${req.method.toUpperCase()}  Path: ${req.originalUrl} Body: `, req.body)
                        if(LOG === 'true') log.info(`[${req.session.username}] [${showip(req)}] [${req.sessionID}] Status: ${msg.status} Response: ${msg.error}`)
                        res.json(msg)
                    }
                }
            })
        }else if(req.params.action){
            var action = req.params.action
            if(action == 'enable'){
                action = 'A'
            }else if(action == 'disable'){
                action = 'I'
            }
            var sql  = "UPDATE idialerx_campaign SET estatus = ? WHERE id = ?"
            var arg = [[action],[req.params.id]]

            connection.query(sql, arg, function (error, results, fields) {
                if(error){
                    res.status(200)
                    var msglog = { code: '500', error: 'Problems with the query or connectivity to the db.' }
                    var msgUser = { code: '500', error: 'Please contact the administrator' }
                    if(LOG === 'true') log.error(`[${req.session.username}] [${showip(req)}] [${req.sessionID}] Method ${req.method.toUpperCase()}  Path: ${req.originalUrl} Body: `, req.body)
                    if(LOG === 'true') log.error(`[${req.session.username}] [${showip(req)}] [${req.sessionID}] Status: ${msglog.code} Response: ${msglog.error}`)
                    res.json(msgUser)
                }else{
                    res.status(200)
                    if(results.length > 0) {
                        var msg = { status: '404', error: 'The incorrect campaign id.' }
                        if(LOG === 'true') log.info(`[${req.session.username}] [${showip(req)}] [${req.sessionID}] Method ${req.method.toUpperCase()}  Path: ${req.originalUrl} Body: `, req.body)
                        if(LOG === 'true') log.info(`[${req.session.username}] [${showip(req)}] [${req.sessionID}] Status: ${msg.status} Response: ${msg.error}`)
                        res.json(msg)
                    }else{
                        var msg = { status: '200', response: 'campaign '+ req.params.action }
                        if(LOG === 'true') log.info(`[${req.session.username}] [${showip(req)}] [${req.sessionID}] Method ${req.method.toUpperCase()}  Path: ${req.originalUrl} Body: `, req.body)
                        if(LOG === 'true') log.info(`[${req.session.username}] [${showip(req)}] [${req.sessionID}] Status: ${msg.status} Response: ${msg.response}`)
                        res.json(msg)
	                }
                }
            })
        }else{
            res.status(200)
            var msg = { status: '500', error: 'Wrong argument.' }
            if(LOG === 'true') log.info(`[${req.session.username}] [${showip(req)}] [${req.sessionID}] Method ${req.method.toUpperCase()}  Path: ${req.originalUrl} Body: `, req.body)
            if(LOG === 'true') log.info(`[${req.session.username}] [${showip(req)}] [${req.sessionID}] Status: ${msg.status} Response: ${msg.error}`)
            res.json(msg)
        }
    } 
}

exports.contact = function(req,res){
    if(!req.session.isAuthed){
        res.status(200)
        var msg = { code: '204', success: 'Required login.' }
        if(LOG === 'true') log.info(`[anonymous] [${showip(req)}] [${req.sessionID}] Method ${req.method.toUpperCase()}  Path: ${req.originalUrl} Body: `, req.body)
        if(LOG === 'true') log.info(`[anonymous] [${showip(req)}] [${req.sessionID}] Status: ${msg.code} Response: ${msg.success}`)
        res.json(msg)
    }else{
        res.status(200)
        var sql = "INSERT INTO idialerx_calls (id_campaign, phone, retries, dnc) VALUES (?, ?, ?, ?)"
        var arg = [[req.body.idcampaign],[req.body.phone],['0'],['0']]
        connection.query(sql, arg, function (error, results, fields) {
            if(error){
                res.status(200)
                var msg = { code: '404', error: 'The incorrect campaign id. Please check all the arguments to be valid.' }
                if(LOG === 'true') log.error(`[${req.session.username}] [${showip(req)}] [${req.sessionID}] Method ${req.method.toUpperCase()}  Path: ${req.originalUrl} Body: `, req.body)
                if(LOG === 'true') log.error(`[${req.session.username}] [${showip(req)}] [${req.sessionID}] Status: ${msg.code} Response: ${msg.error}`)
                res.json(msg)
            }else{
                res.status(200)
                if (req.body.attributes) {
                    if(server.tts === 'true'){
                        tts.create(req.body.attributes, req.body.idcampaign)
	                }
                    for (var key in req.body.attributes){
                        var name = key
                        var value = req.body.attributes[key]
                        var sql = "INSERT INTO idialerx_call_attribute (id_call, columna, value) VALUES(?, ?, ?)"
                        var arg = [[results.insertId],[name],[value]]
                        connection.query(sql, arg, function (error, results2, fields) {
                            if (error){
                                res.status(200)
                                var msglog = { code: '500', error: 'Problems with the query or connectivity to the db.' }
                                var msgUser = { code: '500', error: 'Please contact the administrator' }
                                if(LOG === 'true') log.error(`[${req.session.username}] [${showip(req)}] [${req.sessionID}] Method ${req.method.toUpperCase()}  Path: ${req.originalUrl} Body: `, req.body)
                                if(LOG === 'true') log.error(`[${req.session.username}] [${showip(req)}] [${req.sessionID}] Status: ${msg.code} Response: ${msglog.error}`)
                                res.json(msg)
	                        }
	                    })
	                }
	            }
                var msg = { status: '200', idcall: results.insertId }
                if(LOG === 'true') log.info(`[${req.session.username}] [${showip(req)}] [${req.sessionID}] Method ${req.method.toUpperCase()}  Path: ${req.originalUrl} Body: `, req.body)
                if(LOG === 'true') log.info(`[${req.session.username}] [${showip(req)}] [${req.sessionID}] Status: ${msg.status} Response: idcall ${msg.idcall}`)
                res.json(msg)
            }
        })
    }
}

exports.callinfo = function(req,res){
    if(!req.session.isAuthed){
        res.status(200)
        var msg = { code: '204', success: 'Required login.' }
        if(LOG === 'true') log.info(`[anonymous] [${showip(req)}] [${req.sessionID}] Method ${req.method.toUpperCase()}  Path: ${req.originalUrl} Body: `, req.body)
        if(LOG === 'true') log.info(`[anonymous] [${showip(req)}] [${req.sessionID}] Status: ${msg.code} Response: ${msg.success}`)
        res.json(msg)
    }else{
        var sql = "SELECT id_campaign AS id, status FROM idialerx_calls WHERE id = ?"
        var arg = [req.params.id]
        connection.query(sql, arg, function (error, results, fields) {
            if(error){
                res.status(500)
                res.send(JSON.stringify({"status": 500, "error": error, "response": null}))

                res.status(200)
                var msg = { code: '404', error: 'The incorrect campaign idcall. Please, check that it is valid.' }
                if(LOG === 'true') log.error(`[${req.session.username}] [${showip(req)}] [${req.sessionID}] Method ${req.method.toUpperCase()}  Path: ${req.originalUrl} Body: `, req.body)
                if(LOG === 'true') log.error(`[${req.session.username}] [${showip(req)}] [${req.sessionID}] Status: ${msg.code} Response: ${msg.error}`)
                res.json(msg)
            }else{
                res.status(200)
                if(results[0].status === 'Success') {
                    var sql = "SELECT idc.id, idc.id_campaign, idc.phone, idc.status AS campaign_status, idc.disposition, idc.uniqueid, idc.start_time, idc.end_time, idc.retries, idc.duration, idc.hangup_cause, idc.trunk, sx.* FROM idialerx_calls idc inner join survey_"+results[0].id+"_call sx on sx.id = idc.id WHERE idc.id = ? LIMIT 1"
                }else{
                    var sql = "SELECT id, id_campaign, phone, status AS campaign_status, disposition, uniqueid, start_time, end_time, retries, duration, hangup_cause, trunk FROM idialerx_calls WHERE id = ? LIMIT 1"
	            }
	            connection.query(sql, arg, function (error, results2, fields) {
                    res.status(200)
                    var msg = { status: '200', response: results2 }
                    if(LOG === 'true') log.info(`[${req.session.username}] [${showip(req)}] [${req.sessionID}] Method ${req.method.toUpperCase()}  Path: ${req.originalUrl} Body: `, req.body)
                    if(LOG === 'true') log.info(`[${req.session.username}] [${showip(req)}] [${req.sessionID}] Status: ${msg.status} Response: ${msg.response}`)
                    res.json(msg)
                })
            }
        })
    }
}
