var _ = require('lodash');
var async = require('async');
var express = require('express');
var router = express.Router();
var elasticsearch = require('elasticsearch');
var marked = require('marked');

var ES_URL = 'http://api.causemap.org:9200'


var get_situation = function(req, res, next, id){
  var elasticsearch_client = new elasticsearch.Client({
    host: ES_URL
  });

  elasticsearch_client.get({
    index: 'situations',
    type: 'situation',
    id: req.params.situation_id
  }).then(function(result){
    if (result._source.description){
      result._source.html_description = marked(result._source.description, {
        gfm: true
      })
      console.log(result._source.html_description)
    }

    req.situation = res.locals.situation = result._source;
    return next();
  }, function(error){
    return next(error)
  })
}

router.param('situation_id', get_situation)


/* GET home page. */
router.get('/', function(req, res) {
  var elasticsearch_client = new elasticsearch.Client({
    host: ES_URL
  });

  var query = {
    sort: { creation_date: { order: 'desc' } }
  }

  elasticsearch_client.search({
    index: 'situations',
    type: 'situation',
    size: req.query.size || 25,
    from: req.query.from || 0,
    body: query
  }).then(function(result){
    res.render('index', {
      result: result,
      size: parseInt(req.query.size) || 25,
      from: parseInt(req.query.from) || 0
    });

  }, function(error){
    res.send(500)
  })
});

router.get('/situation/:situation_id', function(req, res, next){
  var elasticsearch_client = new elasticsearch.Client({
    host: ES_URL,
    log: 'trace'
  });

  var situation = req.situation;

  // get the first 3 causes and effects
  async.map(['cause', 'effect'], function(rel_type, map_cb){
    var q = {
      index: 'relationships',
      type: 'relationship',
      size: 3,
      body: {
        query: {
          filtered: {
            filter: {
              term: {}
            }
          }
        }
      }
    }

    q.body.query.filtered.filter.term[rel_type +'._id'] = situation._id;

    elasticsearch_client.search(q).then(function(result){
      var return_me = {};
      return_me[rel_type == 'cause' ? 'effects' : 'causes'] = result.hits.hits.map(
        function(hit){
          return hit._source
        }
      )

      return map_cb(null, return_me)
    }, function(error){
      return map_cb(error, null)
    })
  }, function(map_error, map_results){
    if (map_error){
      console.error(map_error)
      return res.send(500)
    }

    map_results.forEach(function(result){
      situation = _.extend(situation, result)
    })

    res.render('overview', {
      situation: situation
    })
  })
})


router.get('/situation/:situation_id/:relationship_type', function(
  req,
  res,
  next
){
  var elasticsearch_client = new elasticsearch.Client({
    host: ES_URL
  });

  var situation = req.situation;
  var q = {
    index: 'relationships',
    type: 'relationship',
    body: {
      query: {
        filtered: {
          filter: {
            term: {}
          }
        }
      }
    }
  }

  var rel_type = req.params.relationship_type == 'causes' ? 'effect' : 'cause';
  q.body.query.filtered.filter.term[rel_type +'._id'] = situation._id;

  return elasticsearch_client.search(q).then(function(result){
    return res.render('relationships', {
      rel_type: req.params.relationship_type,
      result: result
    });
  }, function(error){
    return next(error);
  })
})

module.exports = router;
