'use strict'

// Constants
const LOG = process.env.LOG || false
const TTS_HOST = process.env.TTS_HOST || 'https://tts.iperfex.com'
const TTS_USER = process.env.TTS_USER || 'myUser'
const TTS_PASS = process.env.TTS_PASS || 'xxxxxxxxxxxxxx'
const TTS_VOICE = process.env.TTS_VOICE || 'Paulina'
const TTS_RATE = process.env.TTS_RATIO || '170'

const SSH_HOST = process.env.SSH_HOST || '192.168.1.11'
const SSH_PORT = process.env.SSH_PORT || '22'
const SSH_USER = process.env.SSH_USER || 'root'
const SSH_PASS = process.env.SSH_PASS || 'xxxxxxxxxxxxxx'

const https = require("https");
const agent = new https.Agent({ rejectUnauthorized: false })
const fetch = require('node-fetch');
const ssh = require('ssh-exec')
var SimpleNodeLogger = require('simple-node-logger')
var log = SimpleNodeLogger.createSimpleLogger({ logFilePath:'/var/log/tts_client.log', timestampFormat:'YYYY-MM-DD HH:mm:ss.SSS' })

function login(text, id) {
    var arg = {
        agent,
        method: "POST",
        body: JSON.stringify({ user: TTS_USER, pass: TTS_PASS }),
        headers: { "Content-Type": "application/json", "Accept": "application/json"},
        credentials: "same-origin"
    }

    fetch(TTS_HOST + '/rest/login', arg)
    .then(function(response) {
        if(LOG === 'true') log.info(`TTS [Function login] Method: POST Path: ${TTS_HOST}/rest/login Body: { user: ${TTS_USER}, pass: ${TTS_PASS} }` )
        var token = response.headers.get('set-cookie')
        if(token){
            for (var key in text){
                var value = text[key]
                if(LOG === 'true') log.info(`TTS [Function login] ID: ${id} Label: ${key} Value: ${value}`)
                tts(token, value, id)
            }
        }else{
            log.info("TTS ERROR - The token can not be created. Please check iPERFEX TTS credentials. For more information send mail to support@iperfex.com")
        }
        logout(token)
    })
    .catch(function(err) {
        //console.error(err)
        log.error(console.error(err))
    })
}

function logout(token) {
    var arg = {
        agent,
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json", "Cookie": token },
        credentials: "same-origin"
      }

      fetch(TTS_HOST + '/rest/logout', arg)
      .then(function(response) {
          if(LOG === 'true') log.info(`TTS [Function logout] Method: POST Path: ${TTS_HOST}/rest/logout headers: { Content-Type: 'application/json', Accept: 'application/json', Cookie: ${token} }`,)
          return response.json()
      })
      .catch(function(err) {
          //console.error(err)
          log.error(console.error(err))
      })
  }


function tts(token, text, id) {
    var arg = {
        agent,
        method: "POST",
        body: JSON.stringify({ txt: text, voice: TTS_VOICE, rate: TTS_RATE, action: "cache" }),
        headers: { "Content-Type": "application/json", "Accept": "application/json", "Cookie": token },
        credentials: "same-origin"
    }

    fetch(TTS_HOST + '/rest/tts', arg)
    .then(function(response) {
        if(LOG === 'true') log.info(`TTS [Function tts] Method: POST Path: ${TTS_HOST}/rest/tts headers: { Content-Type: 'application/json', Accept: 'application/json', Cookie: ${token} } Body: { txt: ${text}, voice: ${TTS_VOICE}, rate: ${TTS_RATE}, action: "cache" }`)
        return response.json();
    })
    .then(function(data) {
        var file = data.filepath
        if(LOG === 'true') log.info(`TTS [Function tts] File Download: `, data)
        download(id, file)
    })
    .catch(function(err) {
        //console.error(err)
        log.error(console.error(err))
    })
}

function download(id, file) {
    var credentials = {
        user: SSH_USER,
        host: SSH_HOST,
        port: SSH_PORT,
        password: SSH_PASS
    }
    if(LOG === 'true') log.info(`TTS [Function download] Credentials: `, credentials)

    var url = TTS_HOST + "/cache/" + file
    var path = '/var/lib/asterisk/sounds/surveys/'+ id + '/s_tmp/'
    var path2 = '/var/lib/asterisk/sounds/campaigns/'+ id +'/c_tmp/'
    var cmd = 'mkdir -p ' + path + ' ' + path2 + ' && chown asterisk:asterisk ' + path + ' ' + path2 + ' && wget --no-check-certificate '+ url +' -O '+ path + file +' && chown asterisk:asterisk ' + path + file + ' && yes|cp -fra ' + path + file + ' ' + path2 + file
    console.log("---->" + cmd + "<----")
    if(LOG === 'true') log.info(`TTS [Function download] CMD: ${cmd}`)
    ssh(cmd, credentials).pipe(process.stdout)
}

exports.create = function(text, id){
    if(LOG === 'true') log.info(`TTS [Function create] id: ${id} text: `, text )
    login(text, id)
}
