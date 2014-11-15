var causemap = angular.module('causemap', []);

causemap.controller('AuthCtrl', [
  '$rootScope',
  '$scope',
  '$http',
  function(
    $rootScope,
    $scope,
    $http
  ){
    $rootScope.auth = {
      login_next: null,
      user_has_account: true
    }

    $rootScope.loginSignup = function(){
      mixpanel.track("login attempt");

      if ($rootScope.auth.user_has_account){
        return $http({
          url: 'http://api.causemap.org:5984/_session',
          method: 'POST',
          withCredentials: true,
          data: {
            name: $rootScope.auth.username,
            password: $rootScope.auth.password
          }
        }).success(function(result){
          toastr.success('logged in')
          mixpanel.track("logged in");

          // close the authentication modal
          $('.modal').modal('hide');
          return $rootScope.getSession();
        }).error(function(error){
          mixpanel.track("login error");
          toastr.error('couldn\'t login')
        })
      }

      // signup
      return $http({
        url: 'http://api.causemap.org:5984/_users/'+ [
          'org.couchdb.user',
          encodeURIComponent($rootScope.auth.username)
        ].join(':'),
        method: 'PUT',
        withCredentials: true,
        data: {
          _id: [
            'org.couchdb.user',
            $rootScope.auth.username,
          ].join(':'),
          name: $rootScope.auth.username,
          password: $rootScope.auth.password,
          roles: [],
          type: 'user'
        }
      }).success(function(result){
        $http({
          url: 'http://api.causemap.org:5984/_session',
          method: 'POST',
          withCredentials: true,
          data: {
            name: $rootScope.auth.username,
            password: $rootScope.auth.password
          }
        }).success(function(result){
          mixpanel.track("logged in");
          toastr.success('logged in')
          $('.modal').modal('hide');
          return $rootScope.getSession()
        })
      }).error(function(error){
        mixpanel.track("signup error");
        if (error.error == 'conflict'){
          return toastr.error('That username is in use');
        }

        toastr.error('There was an error')
        return console.error(error)
      })
    }

    $rootScope.logout = function(){
      $http({
        url: 'http://api.causemap.org:5984/_session',
        method: 'DELETE',
        withCredentials: true
      }).success(function(){
        mixpanel.track("logged out");
        $rootScope.getSession()
      })
    }

    $rootScope.session = null;
    $rootScope.getSession = function(){
      $http({
        url: 'http://api.causemap.org:5984/_session',
        withCredentials: true,
        method: 'GET'
      }).success(function(response){
        $rootScope.session = response;

        if (response.userCtx.name){
          $rootScope.$emit('logged-in', response.userCtx.name);
        }

        if(!$rootScope.$$phase) {
          $rootScope.$apply();
        }
      }).error(function(error){
        return console.error(err);
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

    $rootScope.$watch('session.userCtx', function(newVal, oldVal){
      $('[data-toggle=tooltip]').tooltip();
    })

    $rootScope.$on('logged-in', function(username){
      if ($rootScope.auth.login_next){
        if ($rootScope.auth.login_next.click){
          setTimeout(function(){
            $($rootScope.auth.login_next.click).click();
            $rootScope.auth.login_next = null;
          }, 500)
        }
      }
    });

    $rootScope.$on('logged-in', function(username){
      $('.bookmarkable').each(function(){
        var $this = $(this);

        var id = $this.attr('data-bookmarkable-id');
        var type = $this.attr('data-bookmarkable-type');

        $http({
          url: 'http://api.causemap.org:5984/causemap/_design/bookmark/_show/has_bookmark/'+ $rootScope.session.userCtx.name +'.bookmarked.'+ type +':'+ id,
          method: 'GET',
          withCredentials: true
        }).success(function(response){
          if (response.has_bookmark){
            $this.addClass('bookmarked');
          }
        })
      })
    })

    $rootScope.unbookmark = function(id, type){
      $http({
        url: 'http://api.causemap.org:5984/causemap/_design/bookmark/_update/unbookmark/'+ $rootScope.session.userCtx.name +'.bookmarked.'+ type +':'+ id,
        method: 'POST',
        withCredentials: true
      }).success(function(response){
        if (response.ok){
          $('[data-bookmarkable-id='+ id +']').removeClass('bookmarked')
        }
      })
    }

    $rootScope.bookmark = function(id, type){
      $http({
        url: 'http://api.causemap.org:5984/causemap/_design/bookmark/_update/bookmark/'+ $rootScope.session.userCtx.name +'.bookmarked.'+ type +':'+ id,
        method: 'POST',
        withCredentials: true
      }).success(function(response){
        if (response.ok){
          $('[data-bookmarkable-id='+ id +']').addClass('bookmarked')
        }
      })
    }

    $rootScope.toggleBookmark = function(id, type){
      $http({
        url: 'http://api.causemap.org:5984/causemap/_design/bookmark/_show/has_bookmark/'+ $rootScope.session.userCtx.name +'.bookmarked.'+ type +':'+ id,
        method: 'GET',
        withCredentials: true
      }).success(function(response){
        if (response.has_bookmark){
          $rootScope.unbookmark(id, type)
        } else {
          $rootScope.bookmark(id, type)
        }
      })
    }
  }
])

causemap.controller('SituationsCtrl', [
  '$scope',
  '$rootScope',
  '$http',
  function(
    $scope,
    $rootScope,
    $http
  ){
    $rootScope.add_situation = function(){
      $('button[type="submit"]').button('loading');
      mixpanel.track("new situation submitted");

      $http({
        url: 'http://api.causemap.org:5984/causemap/_design/situation/_update/create',
        method: 'POST',
        withCredentials: true
      }).success(function(result){
        $('button[type="submit"]').button('reset');

        mixpanel.track("situation created");
        var situation_id = result.id;

        $http({
          url: 'http://api.causemap.org:5984/causemap/_design/change/_update/create/'+ situation_id,
          method: 'POST',
          withCredentials: true,
          data: {
            field_name: 'name',
            field_value: $rootScope.new_situation_name
          }
        }).success(function(result){
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
        }).error(function(error){
          toastr.error(error.reason);
          return console.error(error);
        })
      })
    }

    $rootScope.new_situation_name = null;
  }
])

causemap.controller('SituationCtrl', [
  '$scope',
  '$rootScope',
  '$sce',
  '$timeout',
  '$window',
  '$http',
  function(
    $scope,
    $rootScope,
    $sce,
    $timeout,
    $window,
    $http
  ){
    $scope.situation_draft = {
      name: null,
      period: null,
      description: null,
      location: null
    }

    $scope.situation = JSON.parse(
      document.getElementById('situation-json').innerHTML
    );

    $scope.$watch('situation.html_description', function(){
      $scope.situation.safe_html_description = $sce.trustAsHtml(
        $scope.situation.html_description
      );
    })

    function setStrength(relationship){

      var doc_id = [
        $rootScope.session.userCtx.name,
        '.adjusted.relationship.strength:',
        relationship._id
      ].join('')

      $http({
        url: 'http://api.causemap.org:5984/causemap/_design/adjustment/_show/adjustment/'+ doc_id,
        method: 'GET',
        withCredentials: true,
      }).success(function(result){
        if (!result.ok){ return false }

        var doc = result.doc;
        var id = relationship._id;

        switch(doc.adjusted.field.by){
          case 1 : $('[data-id="'+ id +'"] .strength').addClass('upvoted'); break;
          case 0 : $('[data-id="'+ id +'"] .strength').addClass('unvoted'); break;
          case -1 : $('[data-id="'+ id +'"] .strength').addClass('downvoted'); break;
        }


        if(!$scope.$$phase) {
          return $scope.$apply();
        }
      })
    }

    $scope.confirmUntag = function(tag_name){
      // hide other modals
      $('.modal').modal('hide');

      $scope.confirm_untag = tag_name;

      if(!$scope.$$phase) {
        return $scope.$apply();
      }

      // show the confirmation modal
      $('#confirm-untag').modal('show');
    }

    $scope.untag = function(tag_name){
      $http({
        url: [
          'http://api.causemap.org:5984/causemap/_design/action/_update/untag/',
          $scope.situation_id
        ].join(''),
        method: "POST",
        withCredentials: true,
        data: {
          tag_name: tag_name
        }
      }).success(function(response){
        toastr.success('Untagged: '+ tag_name)
        $('.modal').modal('hide');

        $scope.situation.tags.splice(
          $scope.situation.tags.indexOf(tag_name),
          1
        )

        if(!$scope.$$phase) {
          return $scope.$apply();
        }
      }).error(function(error){
        return console.error(error)
      })
    }

    $scope.tag = function(tag_name){
      $http({
        url: [
          'http://api.causemap.org:5984/causemap/_design/action/_update/tag/',
          $scope.situation_id
        ].join(''),
        method: "POST",
        withCredentials: true,
        data: {
          tag_name: tag_name
        }
      }).success(function(response){
        toastr.success('Tagged: '+ tag_name)
        $('.modal').modal('hide');

        if (!$scope.situation.hasOwnProperty('tags')) $scope.situation.tags = [];
        $scope.situation.tags.push(tag_name)

        if(!$scope.$$phase) {
          return $scope.$apply();
        }
      }).error(function(error){
        return console.error(error)
      })
    }

    $rootScope.$on('logged-in', function(username){
      if ($scope.situation.causes){
        $scope.situation.causes.forEach(setStrength);
      }

      if ($scope.situation.effects){
        $scope.situation.effects.forEach(setStrength);
      }
    })

    $scope.situation_draft = _.extend(
      $scope.situation_draft,
      _.clone($scope.situation)
    );

    $scope.situation_id = document.querySelector(
      '#situation'
    ).dataset.situationId

    $scope.createChange = function createChange(field_name, field_value, id){
      $('button[type="submit"]').button('loading');
      mixpanel.track("change submitted");

      function put_update(new_field){
        $http({
          url: [
            'http://api.causemap.org:5984/causemap/_design/change/_update/create/',
            id || $scope.situation_id
          ].join(''),
          method: 'POST',
          withCredentials: true,
          data: new_field
        }).success(function(result){
          $('button[type="submit"]').button('reset');

          mixpanel.track("change saved");
          toastr.success('Saved!')

          // close the modal
          $('.modal').modal('hide');

          if (id){
            return $timeout(function(){
              $window.location.reload();
            }, 2000)
          }

          if (field_name == 'display_image'){
            var $existing_img = $('#overview > .display-image > img');
            var src = [
              'data:'+ new_field._attachments[Object.keys(new_field._attachments)[0]].content_type +';base64,',
              new_field._attachments[Object.keys(new_field._attachments)[0]].data
            ].join('');

            if ($existing_img.length){
              return $('#overview > .display-image > img').attr('srcset', null).attr('title', null).attr('src', src)
            }

            var img = document.createElement('img');
            img.src = src;
            img.classList.add('img-responsive');

            var display_image_div = document.createElement('div');
            display_image_div.classList.add('display-image');

            display_image_div.appendChild(img);

            $('#overview').prepend(display_image_div);
          }

          if (field_name == 'description'){
            return $http({
              url: '?format=json',
              withCredentials: true,
              method: 'GET'
            }).success(function(result){
              $scope.situation = result;

              if(!$scope.$$phase) {
                $scope.$apply();
              }
            }).error(function(){ console.log(arguments) })
          }

          // set the situation name to whatever
          $scope.situation[field_name] = field_value;

          if(!$scope.$$phase) {
            $scope.$apply();
          }
        }).error(function(error){
          mixpanel.track("error saving change");
          $('button[type="submit"]').button('reset');
          toastr.error(error.reason)
          return console.error(error);
        })
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

          img.onload = function(){
            var new_field = {
              field_name: field_name,
              caption: $scope.new_display_image_caption,
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
        }

        return file_reader.readAsDataURL(file);
      }

      put_update({
        field_name: field_name,
        field_value: field_value
      })
    }

    $scope.markForDeletion = function(id){
      $http({
        withCredentials: true,
        url: 'http://api.causemap.org:5984/causemap/_design/action/_update/mark_for_deletion/'+ id,
        method: 'POST'
      }).success(function(result){
        toastr.success('Marked for deletion')
        console.log('marked for deletion:', id)

        $timeout(function(){
          $window.location.reload();
        }, 2000)
      }).error(function(error){
        return console.error(error);
      })
    }

    $scope.unmarkForDeletion = function(id){
      $http({
        withCredentials: true,
        url: 'http://api.causemap.org:5984/causemap/_design/action/_update/unmark_for_deletion/'+ id,
        method: 'POST'
      }).success(function(result){
        toastr.success('Unmarked for deletion')
        console.log('unmarked for deletion:', id)

        $timeout(function(){
          $window.location.reload();
        }, 2000)
      }).error(function(error){
        return console.error(error);
      })
    }

    $scope.adjustRelationshipStrength = function(id, direction){
      if (!$rootScope.requireLogin()){
        toastr.warning('Please login first')
        return
      }

      var adj_id = [
        $rootScope.session.userCtx.name,
        '.adjusted.relationship.strength:',
        id
      ].join('')

      $http({
        withCredentials: true,
        url: 'http://api.causemap.org:5984/causemap/_design/adjustment/_update/'+ direction +'vote_relationship/'+ adj_id,
        method: 'POST'
      }).success(function(result){
        $('[data-id="'+ id +'"] .strength')
          .removeClass('downvoted')
          .removeClass('upvoted')
          .removeClass('unvoted')
          .addClass(direction +'voted');
      }).error(function(error){
        return console.error(error);
      })
    }
  }
])

causemap.controller('RelationshipCtrl', [
  '$scope',
  '$rootScope',
  '$window',
  '$timeout',
  '$http',
  function(
    $scope,
    $rootScope,
    $window,
    $timeout,
    $http
  ){
    $scope.suggestSituations = function(query_text){
      if (query_text.length < 3){
        // too short, do nothing
        return
      }

      // find suggestions
      var query = {
        query: {
          filtered: {
            query: {
              query_string: {
                query: query_text +'*'
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
                      values: [ $scope.situation._id ]
                    }
                  }
                ]
              }
            }
          }
        }
      }

      $http({
        method: 'POST',
        url: 'http://api.causemap.org:9200/situations/situation/_search?size=3',
        data: query
      }).success(function(data, status){
        $scope.situationSuggestions = data;
        if(!$scope.$$phase) {
          $scope.$apply();
        }
      }).error(function(){
        console.error(arguments)
      })
    }

    $scope.createAndAddRelationship = function(rel_type, name){
      $http({
        withCredentials: true,
        method: 'POST',
        url: 'http://api.causemap.org:5984/causemap/_design/situation/_update/create'
      }).success(function(response){
        var situation_id = response.id;

        $http({
          withCredentials: true,
          method: 'POST',
          url: 'http://api.causemap.org:5984/causemap/_design/change/_update/create/'+ situation_id,
          data: {
            field_name: 'name',
            field_value: name
          }
        }).success(function(response){
          return $scope.createRelationship(rel_type, situation_id);
        }).error(function(error){
          return console.error(error);
        })
      }).error(function(error){
        toastr.error(error.reason)
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

      $http({
        method: 'POST',
        withCredentials: true,
        url: 'http://api.causemap.org:5984/causemap/_design/relationship/_update/create',
        data: body
      }).success(function(response){
        $timeout(function(){
          $window.location.reload();
        }, 2000)

        toastr.success('Added to '+ rel_type);
        // close the modal
        return $('.modal').modal('hide');
      }).error(function(error){
        if (error.error == 'conflict'){
          // already exists
          var id = [ body.cause_id, 'caused', body.effect_id ].join(':');
          return $http({
            url: 'http://api.causemap.org:9200/relationships/relationship/'+ id,
            method: 'GET'
          }).success(function(result){
            if (result._source.marked_for_deletion){
              toastr.info('relationship already exists, but was marked for deletion')
              $('.modal').modal('hide');

              $timeout(function(){
                $window.location.reload();
              }, 2000)

              return $scope.unmarkForDeletion(result._source._id)
            }

            $('.modal').modal('hide');
            toastr.error('That relationship already exists')
          }).error(function(error, status){
            toastr.error('Relationship could not be created')
            $('.modal').modal('hide');
            return console.error(error);
          })
        }

        toastr.error(error.reason)
        return console.error(error);
      })
    }
  }
])
