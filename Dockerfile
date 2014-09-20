FROM dockerfile/nodejs-bower-grunt-runtime

ADD . /usr/src/causemap-api
WORKDIR /usr/src/causemap-api

RUN npm install
EXPOSE 3000

CMD npm start
