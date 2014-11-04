var _ = require('lodash');
var async = require('async');
var express = require('express');
var router = express.Router();
var elasticsearch = require('elasticsearch');
var marked = require('marked');

var ES_URL = 'http://api.causemap.org:9200';
var elasticsearch_client = new elasticsearch.Client({
  host: ES_URL,
  sniffOnConnectionFault: true
});


var get_situation = function(req, res, next){
  elasticsearch_client.get({
    index: 'situations',
    type: 'situation',
    id: req.params.situation_id
  }).then(function(result){
    req.situation = res.locals.situation = result._source;
    return next();
  }, function(error){
    return next();
  })
}

var get_aliased_situation = function(req, res, next){
  if (req.situation) return next();

  // search for the situation with this alias
  elasticsearch_client.search({
    index: 'changes',
    type: 'situation.alias.change',
    size: 1,
    body: {
      query: {
        filtered: {
          filter: {
            term: {
              'changed.field.to.untouched': req.params.situation_id
            }
          }
        }
      },
      sort: [
        { creation_date: { order: 'desc' } }
      ]
    }
  }).then(function(result){
    if (!result.hits.hits.length){
      // nothing has ever had this alias
      return next()
    }

    // get the situation that was aliased
    var change = result.hits.hits[0]._source;

    elasticsearch_client.get({
      index: 'situations',
      type: 'situation',
      id: change.changed.doc._id
    }).then(function(hit){
      var situation = hit._source;
      req.situation = res.locals.situation = situation;

      return next();
    }, function(error){
      return next(error)
    })
  })
}

var redirect_if_situation_alias = function(req, res, next){
  if (!req.situation.alias || req.params.situation_id == req.situation.alias){
    return next();
  }

  return res.redirect(301, '/'+ req.situation.alias)
}

var situation_or_404 = function(req, res, next){
  if (req.situation) return next();

  // 404 me bro
  return res.send(404);
}

var markup_situation = function(req, res, next){
  if (!req.situation || !req.situation.description) return next();

  req.situation.html_description = marked(req.situation.description, {
    gfm: true
  })

  return next();
}

var get_similar_situations = function(req, res, next){
  if (!req.situation) return next();
  var omit_ids = [
    req.situation._id
  ]

  if (req.situation.causes){
    req.situation.causes.forEach(function(relationship){
      return omit_ids.push(relationship.cause._id)
    })
  }

  if (req.situation.effects){
    req.situation.effects.forEach(function(relationship){
      return omit_ids.push(relationship.effect._id)
    })
  }

  var similar_query = { "query":
    {
      filtered: {
        query: {
          fuzzy_like_this: {
            fields: ['name'],
            like_text: req.situation.name,
            max_query_terms: 12
          }
        },
        filter: {
          bool: {
            must_not: [
              {
                exists: {
                  field: "marked_for_deletion"
                }
              },
              {
                ids: {
                  type: 'situation',
                  values: omit_ids
                }
              }
            ]
          }
        }
      }
    }
  }

  elasticsearch_client.search({
    index: 'situations',
    type: 'situation',
    body: similar_query
  }).then(function(result){
    req.similar = res.locals.similar = result
    return next();
  }, function(error){
    console.log(error)
    return next();
  })
}

router.get('/landing', function(req, res){
  return res.render('landing');
})


/* GET home page. */
router.get('/', function(req, res) {
  var elasticsearch_client = new elasticsearch.Client({
    host: ES_URL
  });

  var query = {
    sort: [
      { creation_date: { order: 'desc' } }
    ],
    query: {
      filtered: {
        filter: {
          bool: {
            must_not: {
              exists: { field: 'marked_for_deletion' }
            },
            must: []
          }
        }
      }
    }
  }

  if (req.query.search){
    query.query.filtered.query = {
      query_string: {
        query: req.query.search
      }
    }

    delete query.sort
  }

  if (req.query.created_by){
    query.query.filtered.filter.bool.must.push(
      { term: { created_by: req.query.created_by }}
    );
  }

  if (!req.query.search && !req.query.created_by){
    query.query.filtered.filter.bool.must.push({
      exists: {
        field: "display_image"
      }
    })
  }

  return elasticsearch_client.search({
    index: 'situations',
    type: 'situation',
    size: req.query.size || 24,
    from: req.query.from || 0,
    body: query
  }).then(function(result){
    res.render('index', {
      query: req.query,
      result: result,
      size: parseInt(req.query.size) || 24,
      from: parseInt(req.query.from) || 0
    });

  }, function(error){
    res.send(500)
  })
});

router.get('/situation/:situation_id', function(req, res, next){
  return res.redirect(301, '/'+ req.params.situation_id)
})

router.get(
  '/:situation_id',
  get_situation,
  get_aliased_situation,
  situation_or_404,
  redirect_if_situation_alias,
  markup_situation,
  function(req, res, next){
    var elasticsearch_client = new elasticsearch.Client({
      host: ES_URL
    });

    var situation = req.situation;

    // get the first 3 causes and effects
    async.map(['cause', 'effect'], function(rel_type, map_cb){
      var q = {
        index: 'relationships',
        type: 'relationship',
        size: 3,
        body: {
          sort: [
            { strength: { order: 'desc' } },
          ],
          query: {
            filtered: {
              filter: {
                bool: {
                  must_not: [
                    { exists: { field: 'marked_for_deletion' } },
                    { exists: { field: 'cause.marked_for_deletion'} },
                    { exists: { field: 'effect.marked_for_deletion'} }
                  ],
                  must: {
                    term: {},
                  }
                }
              }
            }
          }
        }
      }

      q.body.query.filtered.filter.bool.must.term[rel_type +'._id'] = situation._id;

      elasticsearch_client.search(q).then(function(result){
        var return_me = {};
        return_me[rel_type == 'cause' ? 'effects' : 'causes'] = result.hits.hits.map(
          function(hit){
            return hit._source
          }
        )

        return_me[
          'total_'+ (rel_type == 'cause' ? 'effects' : 'causes')
        ] = result.hits.total;

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

      req.situation = res.situation = situation;
      return next()
    })
  },
  get_similar_situations,
  function(req, res){

    if (req.query.format == 'json'){
      return res.json(req.situation);
    }

    return res.render('overview', {
      body_class: 'situation'
    })
  }
)


router.get('/situation/:situation_id/:relationship_type', function(
  req,
  res
){
  return res.redirect(301, [
    '/',
    req.params.situation_id,
    '/',
    req.params.relationship_type
  ].join(''))
})

router.get(
  '/:situation_id/:relationship_type(causes|effects)',
  get_situation,
  get_aliased_situation,
  situation_or_404,
  function(req, res, next){
    if (req.situation.alias && req.params.situation_id != req.situation.alias){
      return res.redirect(
        301,
        ['/', req.situation.alias, '/', req.params.relationship_type ].join('')
      )
    }

    return next();
  },
  function(
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
      size: 100,
      body: {
        sort: [
          { strength: { order: 'desc' } },
        ],
        query: {
          filtered: {
            filter: {
              bool: {
                must_not: [
                  { exists: { field: 'marked_for_deletion' } },
                  { exists: { field: 'cause.marked_for_deletion'} },
                  { exists: { field: 'effect.marked_for_deletion'} }
                ],
                must: {
                  term: {},
                }
              }
            }
          }
        }
      }
    }

    var rel_type = req.params.relationship_type == 'causes' ? 'effect' : 'cause';
    q.body.query.filtered.filter.bool.must.term[rel_type +'._id'] = req.situation._id;

    return elasticsearch_client.search(q).then(function(result){
      req.situation[req.params.relationship_type] = result.hits.hits.map(
        function(hit){
          return hit._source
        }
      )

      req.result = res.result = result;

      return next()
    }, function(error){
      return next(error);
    })
  },
  get_similar_situations,
  function(req, res){
    return res.render('relationships', {
      rel_type: req.params.relationship_type
    });
  }
)

module.exports = router;
