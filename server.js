'use strict'

// Constants
const SERVERPORT = process.env.SERVERPORT || 8080
const SERVERHOST = process.env.SERVERHOST || '0.0.0.0'
const MYSQL_HOST = process.env.MYSQL_HOST || '192.168.1.10'
const MYSQL_PORT = process.env.MYSQL_PORT || '3306'
const MYSQL_USER = process.env.MYSQL_USER || 'isurveyx_us'
const MYSQL_PASS = process.env.MYSQL_PASS || 'xxxxxxxxxxxxxx'
const MYSQL_DATABASE = process.env.MYSQL_DATABASE || 'isurveyx'
const TTS_IPERFEX = process.env.TTS_IPERFEX || true
const LOG = process.env.LOG || false

module.exports = {
    host: MYSQL_HOST,
    port: MYSQL_PORT,
    user: MYSQL_USER,
    pass: MYSQL_PASS,
    database: MYSQL_DATABASE,
    tts: TTS_IPERFEX
}

var express = require('express')
var session = require('express-session')
var validator = require('express-validator')
var MySQLStore = require('express-mysql-session')(session)
var bodyParser = require('body-parser')
var cookieParser = require('cookie-parser')
var SimpleNodeLogger = require('simple-node-logger')
var log = SimpleNodeLogger.createSimpleLogger({ logFilePath:'/var/log/apirest.log', timestampFormat:'YYYY-MM-DD HH:mm:ss.SSS' })
var routes = require('./routes')

var app = express()

//start body-parser configuration
app.use(bodyParser.urlencoded({ extended: true }))
app.use(bodyParser.json())

app.use(validator())

app.use(cookieParser())

app.use(session({
  key: 'user_sid',
  secret: '1234DSFs@adfihasjfoihaoisshfopuaigiugUIG1234!@#$asd',
  resave: false,
  saveUninitialized: false,
  cookie: {
  	secure: false,
  	maxAge: 60000,
  	httpOnly: false,
  },
  store:new MySQLStore({
    host: MYSQL_HOST,
    port: MYSQL_PORT,
    user: MYSQL_USER,
    password: MYSQL_PASS,
    database: MYSQL_DATABASE,
    insecureAuth: true,

    checkExpirationInterval: 1000 * 60 * 5,// 5 min // How frequently expired sessions will be cleared; milliseconds.
    expiration: 1000 * 60 * 60 * 24 * 7,// 1 week // The maximum age of a valid session; milliseconds.
    createDatabaseTable: true,// Whether or not to create the sessions database table, if one does not already exist.
    schema: {
        tableName: 'sessions',
        columnNames: {
            session_id: 'session_id',
            expires: 'expires',
            data: 'data'
        }
    }

  })
}))

app.use(function (req, res, next) {
    res.setHeader('X-Powered-By', 'IPERFEX API REST')
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Accept', 'application/json')
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE')
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type')
    next()
})

var router = express.Router()

// GET /callinfo/:id
router.get('/callinfo/:id([0-9]{0,10})', routes.callinfo)

// POST /contact
router.post('/contact', validateContact, routes.contact)

// PUT /campaigns/:id/enable
router.put('/campaigns/:id([0-9]{0,10})/:action(enable|disable)', routes.campaignsStatus)

// GET /campaigns/:id
router.get('/campaigns/:id([0-9]{0,10})/:status(status)', routes.campaignsStatus)

// GET /campaigns/:id
router.get('/campaigns/:id([0-9]{0,10})', routes.campaigns)

// GET /campaigns
router.get('/campaigns', routes.campaigns)

// GET /logout
router.get('/logout', function (req, res) {
    var msg = { code: '200', success: 'logout success.' }
    if(LOG === 'true') log.info(`[${req.session.username}] [${showip(req)}] [${req.sessionID}] Method ${req.method.toUpperCase()}  Path: ${req.originalUrl} Body: `, req.body)
    if(LOG === 'true') log.info(`[${req.session.username}] [${showip(req)}] [${req.sessionID}] Status: ${msg.code} Response: ${msg.success}`)
    req.session.destroy()
    res.clearCookie('user_sid')
    res.status(200)
    res.json(msg)
})

// POST /login
router.post('/login', validateLogin, routes.login)

// GET /hello
router.get('/hello', function(req, res) {
    if(!req.session.isAuthed){
        res.status(200)
        var msg = { code: 204, success: 'Required login.' }
        if(LOG === 'true') log.info(`[anonymous] [${showip(req)}] [${req.sessionID}] Method ${req.method.toUpperCase()}  Path: ${req.originalUrl} Body: `, req.body)
        if(LOG === 'true') log.info(`[anonymous] [${showip(req)}] [${req.sessionID}] Status: ${msg.code} Response: ${msg.success}`)
	    res.json(msg)
	}else{
        res.status(200)
        var msg = { message: 'hello world :)' }
        if(LOG === 'true') log.info(`[${req.session.username}] [${showip(req)}] [${req.sessionID}] Method ${req.method.toUpperCase()}  Path: ${req.originalUrl} Body: `, req.body)
        if(LOG === 'true') log.info(`[${req.session.username}] [${showip(req)}] [${req.sessionID}] Status: ${res.statusCode} Response: ${msg.message}`)
	    res.json(msg)
	}
})

//path
app.use('/rest', router)

//create app server
var server = app.listen(SERVERPORT,  SERVERHOST, function () {
    log.info(`Running on http://${SERVERHOST}:${SERVERPORT}`)
})

function showip(req){
    var ip = (req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.socket.remoteAddress || req.connection.socket.remoteAddress).split(",")[0]
    return ip
}

function validateLogin(req, res, next) {
    req.checkBody('user', 'Invalid username a minimum of 4 to 20 characters is required.').len(4,20)
    req.checkBody('user', 'Blank unsername').notEmpty()
    req.checkBody('user', 'requires alphanumeric username with Spanish characters').isAlphanumeric('es-ES')

    req.checkBody('pass', 'Invalid password a minimum of 5 to 20 characters is required.').len(5,20)
    req.checkBody('pass', 'Blank password').notEmpty()
    req.checkBody('pass', 'requires alphanumeric password with Spanish characters').isAlphanumeric('es-ES')

    var errors = req.validationErrors()
    if (errors) {
        var response = { errors: [] }
        errors.forEach(function(err) {
            response.errors.push(err.msg)
        })
        res.statusCode = 400
        if(LOG === 'true') log.error(`[${req.session.username}] [${showip(req)}] [${req.sessionID}] Method ${req.method.toUpperCase()}  Path: ${req.originalUrl} Body: `, req.body)
        if(LOG === 'true') log.error(`[${req.session.username}] [${showip(req)}] [${req.sessionID}] Status: ${res.statusCode} Response: ${response.errors}`)
        return res.json(response)
    }
    return next()
}


function validateContact(req, res, next) {
    req.checkBody('idcampaign', 'Requires a valid idcampaign. Only supports numeric characters.').matches(/^([0-9]{1,30})$/)
    req.checkBody('phone', 'Requires phone number from 3 digits to 30 characters.').matches(/^([0-9]{3,30})$/)
    req.checkBody('attributes', 'Define the attributes you need. Can not be blank.').optional().notEmpty()

    var errors = req.validationErrors()
    if (errors) {
        var response = { errors: [] }
        errors.forEach(function(err) {
            response.errors.push(err.msg)
        })
        res.statusCode = 400
        if(LOG === 'true') log.error(`[${req.session.username}] [${showip(req)}] [${req.sessionID}] Method ${req.method.toUpperCase()}  Path: ${req.originalUrl} Body: `, req.body)
        if(LOG === 'true') log.error(`[${req.session.username}] [${showip(req)}] [${req.sessionID}] Status: ${res.statusCode} Response: ${response.errors}`)
        return res.json(response)
    }
    return next()
}