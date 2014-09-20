FROM dockerfile/nodejs

RUN npm install -g bower

ADD . /usr/src/causemap-api
WORKDIR /usr/src/causemap-api

RUN npm install
RUN bower install --allow-root
EXPOSE 3000

CMD npm start
