angular.module('db', [])

  .value(
    'causemap_couchdb_url',
    'http://api.causemap.org:5984/causemap'
  )

  .value(
    'user_couchdb_url',
    'http://api.causemap.org:5984/_users'
  )

  .factory('causemap_db', [
    'causemap_couchdb_url',
    function($causemap_couchdb_url){
      PouchDB.plugin(Update);

      var db = new PouchDB($causemap_couchdb_url);

      return db;
    }
  ])

  .factory('user_db', [
    'user_couchdb_url',
    function($user_couchdb_url){
      var db = new PouchDB($user_couchdb_url);

      return db;
    }
  ])

angular.module('search', ['elasticsearch'])

  .value(
    'elasticsearch_url',
    'http://api.causemap.org:9200'
  )

  .service('elasticsearch_client', [
    'elasticsearch_url',
    'esFactory',
    function($elasticsearch_url, esFactory){
      return esFactory({
        host: $elasticsearch_url
      })
    }
  ])

var causemap = angular.module('causemap', ['db', 'search']);

causemap.controller('AuthCtrl', [
  '$rootScope',
  '$scope',
  'user_db',
  function(
    $rootScope,
    $scope,
    user_db
  ){
    $rootScope.auth = {
      user_has_account: true
    }

    $rootScope.loginSignup = function(){
      mixpanel.track("login attempt");

      if ($rootScope.auth.user_has_account){
        return user_db.login(
          $rootScope.auth.username,
          $rootScope.auth.password,
          function(error, result){
            if (error){
              mixpanel.track("login error");
              toastr.error('couldn\'t login')
              return console.error('dog', error)
            }

            mixpanel.track("logged in");
            toastr.success('logged in')
            // close the authentication modal
            $('.modal').modal('hide');
            return $rootScope.getSession();
          }
        )
      }

      return user_db.signup(
        $rootScope.auth.username,
        $rootScope.auth.password,
        function(error, result){
          if (error){
            mixpanel.track("signup error");
            return console.error(error)
          }

          user_db.login(
            $rootScope.auth.username,
            $rootScope.auth.password,
            function(error, result){
              mixpanel.track("logged in");
              // close the auth modal
              return $rootScope.getSession()
            }
          )
        }
      )
    }

    $rootScope.logout = function(){
      user_db.logout(function(){
        mixpanel.track("logged out");
        $rootScope.getSession()
      })
    }

    $rootScope.session = null;
    $rootScope.getSession = function(){
      user_db.getSession(function(err, response){
        if (err) return console.error(err);
        $rootScope.session = response;

        if (response.userCtx.name){
        }

        $rootScope.$apply();
      })
    }

    $rootScope.requireLogin = function(next){
      if (!$rootScope.session.userCtx.name){
        mixpanel.track("login required");

        // show the auth modal
        return false
      }

      return true
    }

    $rootScope.getSession()
  }
])

causemap.controller('SituationsCtrl', [
  '$scope',
  '$rootScope',
  'causemap_db',
  function(
    $scope,
    $rootScope,
    causemap_db
  ){
    $rootScope.add_situation = function(){
      $('button[type="submit"]').button('loading');
      mixpanel.track("new situation submitted");

      causemap_db.update(
        'situation/create',
        function(error, result){
          $('button[type="submit"]').button('reset');

          if (error){
            mixpanel.track("error submitting new situation");
            toastr.error(error.message)
            return console.error(error);
          }

          mixpanel.track("situation created");
          var situation_id = JSON.parse(result.body).id;

          causemap_db.update(
            'change/create/'+ situation_id, {
              body: JSON.stringify({
                field_name: 'name',
                field_value: $rootScope.new_situation_name
              })
            },
            function(error, result){
              if (error) return console.error(error);

              // close the modal
              $('.modal').modal('hide');
              $('#add-situation-modal').on('hidden.bs.modal', function(){
                // reset the new_situation_name
                $scope.new_situation_name = null;
                toastr.success('Created!')

                setTimeout(function(){
                  // send the user to the new situation url
                  window.location = '/situation/'+ situation_id;
                }, 1200)
              });
            }
          )
        }
      )
    }

    $rootScope.new_situation_name = null;
  }
])

causemap.controller('SituationCtrl', [
  '$scope',
  '$rootScope',
  'elasticsearch_client',
  'causemap_db',
  function(
    $scope,
    $rootScope,
    elasticsearch_client,
    causemap_db
  ){
    $scope.situation_draft = {
      name: null,
      period: null,
      description: null,
      location: null
    }

    function getSituation(situation_id){
      elasticsearch_client.get({
        index: 'situations',
        type: 'situation',
        id: situation_id
      }).then(function(hit){
        $scope.situation = hit._source;

        $scope.situation_draft = _.extend(
          $scope.situation_draft,
          _.clone($scope.situation)
        );
      }, function(error){
        console.error(error)
      })
    }

    $scope.situation = JSON.parse(
      document.getElementById('situation-json').innerHTML
    );

    $scope.situation_draft = _.extend(
      $scope.situation_draft,
      _.clone($scope.situation)
    );

    $scope.situation_id = document.querySelector(
      '#situation'
    ).dataset.situationId

    $scope.createChange = function createChange(field_name, field_value){
      $('button[type="submit"]').button('loading');
      mixpanel.track("change submitted");

      function put_update(new_field){
        causemap_db.update(
          'change/create/'+ $scope.situation_id, {
            body: JSON.stringify(new_field)
          }, function(error, result){
            $('button[type="submit"]').button('reset');

            if (error){
              mixpanel.track("error saving change");
              toastr.error(error.message)
              return console.error(error);
            }

            mixpanel.track("change saved");
            toastr.success('Saved!')

            // close the modal
            $('.modal').modal('hide');

            // set the situation name to whatever
            $scope.situation[field_name] = field_value;

            if (field_name == 'description'){
              $scope.situation.html_description = marked(field_value, {
                gfm: true
              })

              return $scope.$apply();
            }

            $scope.$apply();
          }
        )
      }

      if (field_name == 'display_image'){
        // get the file data
        // create the new change body
        var file_input = document.getElementById('new-display-image-input');
        var file = file_input.files[0];
        var file_reader = new FileReader()

        file_reader.onload = function(){
          var img = document.createElement("img");
          img.file = file;
          img.src = file_reader.result;

          var new_field = {
            field_name: field_name,
            width: img.naturalWidth,
            height: img.naturalHeight,
            filename: file.name,
            _attachments: {}
          };

          new_field._attachments[file.name] = {
            content_type: file.type,
            data: file_reader.result.replace(
              'data:'+ file.type +';base64,',
              ''
            )
          }

          return put_update(new_field);
        }

        return file_reader.readAsDataURL(file);
      }

      put_update({
        field_name: field_name,
        field_value: field_value
      })
    }

    $scope.markForDeletion = function(id){
      causemap_db.update(
        'action/mark_for_deletion/'+ id,
        function(error, result){
          if (error) return console.error(error);
          $scope.situation.marked_for_deletion = true;
          $scope.$apply();
          getSituation($scope.situation_id);
          console.log('marked for deletion:', id)
        }
      )
    }

    $scope.unmarkForDeletion = function(id){
      causemap_db.update(
        'action/unmark_for_deletion/'+ id,
        function(error, result){
          if (error) return console.error(error);
          delete $scope.situation.marked_for_deletion;
          $scope.situation.unmarked_for_deletion = true;
          $scope.$apply();
          getSituation($scope.situation_id);
          console.log('unmarked for deletion:', id)
        }
      )
    }
  }
])

causemap.controller('RelationshipCtrl', [
  '$scope',
  '$rootScope',
  'causemap_db',
  'elasticsearch_client',
  function(
    $scope,
    $rootScope,
    causemap_db,
    elasticsearch_client
  ){
    $scope.suggestSituations = function(query_text){
      if (query_text.length < 3){
        // too short, do nothing
        return
      }

      // find suggestions
      var query = {
        query: {
          query_string: {
            query: query_text +'*'
          }
        }
      }

      elasticsearch_client.search({
        index: 'situations',
        type: 'situation',
        size: 3,
        body: query
      }).then(function(result){
        $scope.situationSuggestions = result;
        $scope.$apply();
      }, function(error){
        console.error(error)
      })
    }

    $scope.createRelationship = function(rel_type, id){
      if (rel_type == 'causes'){
        var body = {
          cause_id: id,
          effect_id: $scope.situation._id
        }
      } else {
        var body = {
          cause_id: $scope.situation._id,
          effect_id: id
        }
      }

      causemap_db.update(
        'relationship/create',
        { body: JSON.stringify(body) },
        function(error, response){
          if (error){
            toastr.error(error.message)
            return console.error(error);
          }

          toastr.success('Added to '+ rel_type);
          // close the modal
          return $('.modal').modal('hide');
        }
      )
    }
  }
])
