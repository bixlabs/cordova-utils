/**
 * This service aims to manage the storage on the client side.
 */
angular.module('emInspectionsApp.services')
  .factory('Camera', ['$q', '$cordovaFile', function ($q, $cordovaFile) {
    var camera = null,
        jpegHeader  = 'data:image/jpeg;base64,',
        pngHeader   = 'data:image/png;base64,',
        jpegFormat  = 'image/jpeg',
        pngFormat   = 'image/png',
        initialized = false,
        canvas = document.createElement('CANVAS'),
        ctx = canvas.getContext('2d'),
        toBase64DefferedCol = [],
        imageURLsBuffer = [],
        convertingImages = false,
        cameraDefaultOptions = {
          quality : 40,
          targetWidth: 1024,
          targetHeight: 768,
          destinationType: 1, // DATA_URL : 0, FILE_URI : 1, NATIVE_URI : 2
          encodingType:    0, // JPEG : 0, PNG : 1
          sourceType:      1, // PHOTOLIBRARY : 0, CAMERA : 1, SAVEDPHOTOALBUM : 2
          saveToPhotoAlbum: false
        },
        // Fixed because of safari max-size limitations
        img = new Image(cameraDefaultOptions.targetWidth, cameraDefaultOptions.targetHeight);
    img.crossOrigin = 'Anonymous';

    var getThePicture = function (optionsMerge, promise) {
      camera.getPicture(function (picture) {
        promise.resolve({
          header: optionsMerge.encodingType ? pngHeader : jpegHeader,
          data:   picture
        });
      }, function (error) {
        promise.reject(error);
      }, optionsMerge);
    };

    /**
     * Processes the image URL buffer in order to get the base 64 of each.
     * This has to be performed synchronously because Safari has a limit on how
     * much memory is allowed to be loaded for images (Android will work fine
     * asynchronously).
     */
    var getBase64 = function () {
      // If there are any images on buffer
      if (imageURLsBuffer.length) {
        var currentDeffered = toBase64DefferedCol[0];
        img.onload = function () {
          var dataURL;
          canvas.height = cameraDefaultOptions.targetHeight;
          canvas.width = cameraDefaultOptions.targetWidth;
          ctx.drawImage(img, 0, 0, cameraDefaultOptions.targetWidth, cameraDefaultOptions.targetHeight);
          var format = cameraDefaultOptions.encodingType ? pngFormat : jpegFormat;
          dataURL = canvas.toDataURL(format, Math.floor(cameraDefaultOptions.quality / 100));
          var data = dataURL.replace(/^data:image\/([\w]*);base64,/,'');
          currentDeffered.resolve(data);
          img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==';
          // Deletes the processed image from the buffer
          toBase64DefferedCol.splice(0, 1);
          imageURLsBuffer.splice(0, 1);
          getBase64();
        };
        img.src = imageURLsBuffer[0];
      }
      // Finished processing all images on buffer
      else {
        convertingImages = false;
      }
    };

    return {
      initialize:           function () {
        camera = navigator.camera;
        initialized = true;
      },
      takePicture:          function (options) {
        var optionsMerge = {};
        angular.extend(optionsMerge, cameraDefaultOptions);
        angular.extend(optionsMerge, options);
        var deferred = $q.defer();

        // Remove from cache all previous photos (should be only the last one)
        // This has to be done before the new photo is taken because cache is used for saving it once taken
        navigator.camera.cleanup(function() {
          getThePicture(optionsMerge, deferred);
        }, function() {
          getThePicture(optionsMerge, deferred);
        });

        return deferred.promise;
      },
      pickFromPhotoLibrary: function (options) {
        var optionsMerge = {};
        angular.extend(optionsMerge, cameraDefaultOptions);
        angular.extend(optionsMerge, options);
        optionsMerge.sourceType = 0;
        var deferred = $q.defer();

        // Remove from cache all previous photos (should be only the last one)
        // This has to be done before the new photo is taken because cache is used for saving it once taken
        navigator.camera.cleanup(function() {
          getThePicture(optionsMerge, deferred);
        }, function() {
          getThePicture(optionsMerge, deferred);
        });

        return deferred.promise;
      },

      // from : http://stackoverflow.com/questions/6150289/how-to-convert-image-into-base64-string-using-javascript
      convertImgToBase64URL: function(url, outputFormat) {
        var deferred = $q.defer();
        toBase64DefferedCol.push(deferred);
        imageURLsBuffer.push(url);
        if (!convertingImages) {
          convertingImages = true;
          getBase64();
        }
        return deferred.promise;
      },

      /**
       * It's going to make a copy of the file passed by parameter and will be placed in
       * cordova.file.dataDirectory with the same name prefixed with a log id.
       * @param imageUrl
       * @returns {*}
       */
      saveToFile: function(imageUrl) {

        return $q(function(resolve, reject) {
          function makeid() {
            var text = "";
            var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

            for (var i=0; i < 5; i++) {
              text += possible.charAt(Math.floor(Math.random() * possible.length));
            }
            return text;
          }

          var name = imageUrl.substr(imageUrl.lastIndexOf('/') + 1);
          var namePath = imageUrl.substr(0, imageUrl.lastIndexOf('/') + 1);
          var newName = makeid() + name;

          $cordovaFile.copyFile(namePath, name, cordova.file.dataDirectory, newName)
            .then(function(info){
              resolve(newName);
            }, function(e){
              reject(e);
            });
        });
      },

      removeImagesFromHD: function(images, index) {

        var simultaneous = 3, index = index || 0, self = this;
        return $q(function(resolve, reject) {

          if (index > images.length) {
            resolve();
          } else {

            var removeProcesses = [];
            for (var i = 0; (i < simultaneous) && images[index + i]; i++) {

              var imageURL = images[index + i];

              removeProcesses.push(self.removeFromStorage(imageURL));
            }

            $q.all(removeProcesses)
              .then(function() {
                self.removeImagesFromHD(images, index + simultaneous)
                  .then(function () {
                    resolve()
                  });
              })
              .catch(function(error) {

                reject(error);
              });
          }
        });
      },

      /**
       * Removes the image identified by 'image url' from the storage
       * Will assume we are using: cordova.file.dataDirectory
       */
      removeFromStorage: function (imageURL) {
        return $q(function(resolve, reject) {
          var imageName = imageURL.substr(imageURL.lastIndexOf('/') + 1) || imageURL;
          $cordovaFile.removeFile(cordova.file.dataDirectory, imageName)
            .then(function (e) {
              
              console.log("removed sucessfully file with name: " + imageName);
              resolve();
            }, function (err) {

              console.log("could not remove file with name: " + imageName);
              reject(err);
            });
        });
      },

      reduceSize: function (data ,wantedWidth, wantedHeight) {

        var deferred = $q.defer();
        var img = document.createElement('img');

        // When the event "onload" is triggered we can resize the image.
        img.onload = function() {
          // We create a canvas and get its context.
          var canvas = document.createElement('canvas');
          var ctx = canvas.getContext('2d');

          // We set the dimensions at the wanted size.
          canvas.width = wantedWidth;
          canvas.height = wantedHeight;

          // We resize the image with the canvas method drawImage();
          ctx.drawImage(this, 0, 0, wantedWidth, wantedHeight);

          
          deferred.resolve(canvas.toDataURL());
          img.onload = null;
          canvas = null;
        };

        // We put the Data URI in the image's src attribute
        img.src = data;
        return deferred.promise;
      },

      getNativeImageURL: function (imageURL) {

        if (!imageURL) return "";

        //if url is full path => parse and just use the name inside imageURL
        if (imageURL.lastIndexOf('/') !== -1) {
          return cordova.file.dataDirectory + imageURL.substr(imageURL.lastIndexOf('/') + 1);
        }

        //else, we have just the name so concat with cordova.file.dataDirectory
        return cordova.file.dataDirectory + imageURL;
      }
    }
  }]);
