FROM node

ADD . /usr/src/causemap-api
WORKDIR /usr/src/causemap-api

RUN npm install
EXPOSE 3000

CMD npm start
