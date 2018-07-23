FROM centos:centos7
MAINTAINER Federico Pereira <fpereira@iperfex.com>

RUN yum -y update \
&& yum -y install curl wget htop git vim iproute hostname inotify-tools yum-utils which openssh-clients bind-utils net-tools psmisc telnet \
&& yum -y install epel-release \
&& yum clean all \
&& yum -y install supervisor \
&& curl --silent --location https://rpm.nodesource.com/setup_8.x | bash - \
&& yum -y install gcc-c++ make \
&& yum -y install -y nodejs \
&& mkdir -p /opt/app

# JS
WORKDIR /opt/app

COPY package*.json ./

RUN npm install

COPY . .

COPY server.js /opt/app/server.js
COPY routes.js /opt/app/routes.js
COPY tts.js /opt/app/tts.js

COPY supervisord.conf /etc/supervisord.conf

EXPOSE 8080/tcp

CMD ["/usr/bin/supervisord"]
