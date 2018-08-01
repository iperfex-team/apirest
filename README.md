# iPERFEX API REST

Fecerico Pereira (c) 2018
Federico Pereira <fpereira@iperfex.com>

This code is distributed under the MIT license.

# INTRO

# Quick Install
https://github.com/iperfex-team/apirest/wiki/Docker-Install

# Features
- Runs as a Docker Container
- CentOS 7
- Node
    - express
    - mysql
    - express-session
    - express-mysql-session
    - express-validator
    - body-parser
    - cookie-parser
    - node-fetch
    - ssh-exec
    - simple-node-logger

## ENV

| Arguments  | Description  |
| :------------ |:------------------------------------------------: 
| LOG  | Modo debug true or false |
| SERVERPORT  | Assigned port of the application. By default 8080 |
| SERVERHOST  | IP to which he hears the requests. By default 0.0.0.0 |
| MYSQL_HOST  | MYSQL Server Host |
| MYSQL_PORT  | MYSQL Server Port |
| MYSQL_USER  | MYSQL Server User |
| MYSQL_PASS  | MYSQL Server Pass |
| MYSQL_DATABASE | MYSQL Server Database |
| TTS_IPERFEX | Audio creation when inserting a record with the contact method with attributes. By default false |
| TTS_HOST | IPERFEX TTS Host. By default https://tts.iperfex.com/admin |
| TTS_USER | IPERFEX TTS User |
| TTS_PASS | IPERFEX TTS Pass |
| TTS_VOICE  | IPERFEX TTS Voice. By default Paulina |
| TTS_RATIO  | IPERFEX TTS Ratio. By default 170 |
| SSH_HOST  | SSH Host |
| SSH_PORT  | SSH Port |
| SSH_USER  | SSH User |
| SSH_PASS  | SSH Pass |

# Build Docker

```bash
docker build -t iperfex/apirest:2.0 -f Dockerfile .
```

# Run Docker
```bash
docker run --name apirest_app -itd --env-file ./ENV -p 0.0.0.0:8080:8080/tcp  iperfex/apirest:2.0
```
# Run Docker option 2
```bash
docker run --name apirest_app -itd --net=host --env-file ./ENV iperfex/apirest:2.0
```

# Systemctl Auto Start boot
```bash
yes|cp -fra /usr/src/apirest/apirest.service  /etc/systemd/system/apirest.service
systemctl enable apirest
systemctl start  apirest
```

# Enter Console Linux
```bash
bash -c "clear && docker exec -it apirest_app bash"
```

# save Docker image
```bash
docker save -o  /root/apirest_2.2.0.0-3.tar iperfex/apirest:2.0
```
# Load Docker image
```bash
docker load -i /root/apirest_2.2.0.0-3.tar
```

## NodeJS package

```bash
npm install express --save
npm install mysql --save
npm install express-session --save
npm install express-mysql-session --save
npm install express-validator --save
npm install body-parser --save
npm install cookie-parser --save
npm install node-fetch --save
npm install ssh-exec --save
npm install simple-node-logger --save
```
