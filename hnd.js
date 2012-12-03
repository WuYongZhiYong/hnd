var xml = require("node-xml")
  , request = require('request')
  , concat = require('concat-stream')
  , fs = require('fs')
  , http = require('http')
  , config = JSON.parse(fs.readFileSync(__dirname+'/config.json', 'utf-8'))
  , screenshot = require('./screenshot')

function copyExtend() {
  var r = {}
    , cpk = function(key) { r[key] = obj[key] }
    , i, obj
  for (i = -1; (obj = arguments[++i]); ) {
    Object.keys(obj).forEach(cpk)
  }
  return r
}

function getHNItems( cb ) {
  http.request({
      host: 'news.ycombinator.com'
    , path: '/rss'
  }, function (res) { res.pipe(concat(function (error, body) {
    var parser = new xml.SaxParser(function(_cb) {
      var items = [], i = -1, elems = ['title', 'link', 'comments'], e;
      _cb.onStartElementNS(function(elem, attrs, prefix, uri, namespaces) {
        if ( elem == 'item' ) {
          items[++i] = {};
        } else if ( elems.indexOf( elem ) > -1 ) {
          e = elem;
        } else {
          e = false;
        }
      });
      _cb.onCharacters(function(chars) {
        if ( i > -1 && e ) {
          if ( items[i][e] ) {
            items[i][e] = items[i][e] + chars;
          } else {
            items[i][e] = chars;
          }
        }
      });
      _cb.onEndElementNS(function(elem, prefix, uri) {
        if ( elem == 'channel' ) {
          items = items.map( function ( item ) {
            item.id = parseInt( item.comments.match(/\d+/)[0], 10);
            return item;
          });
          if (cb) cb( items );
        }
      });
    });
    if (!error) {
      parser.parseString(body);
    }
  })) }).end()
}

function postToWeibo( item ) {
  request('http://api.weibo.com/short_url/shorten.json?source=2887826189&url_long=' +
          encodeURIComponent(item.link) + '&url_long=' +
          encodeURIComponent(item.comments), function(e, r, body) {
    var result = JSON.parse(body)
      , ellipsis, content
    if (!result.urls) {
      console.log('ERROR: shorten url fail')
      console.log(item)
    } else {
      item.linkShorted = result.urls[0].url_short
      item.commentsShorted = result.urls[1].url_short
      ellipsis = item.title.length > 220 ? '...' : ''
      content = '《'+item.title.substring(0,220) + ellipsis + '》原文：' +
                encodeURI(item.linkShorted).replace(/ /g, '+') +
                ' HN评论：'+encodeURI(item.commentsShorted).replace(/ /g, '+')
      screenshot(item.link, function(e, b) {
        var resfunc = function (msg) {
          return function(e, r, body) {
            if (e) {
              console.log('ERROR: ' + msg)
              if (body) console.log(body)
            }
            console.log(item)
          }
        }
        if (e) {
          request.post({
              uri: 'https://api.weibo.com/2/statuses/update.json'
            , form: { access_token: config.ACCESS_TOKEN, status: content }
          }, resfunc('update fail'))
        } else {
          request.post({
              uri: 'https://api.weibo.com/2/statuses/upload.json'
            , encoding: 'utf8'
            , headers: {
                  'content-type': 'multipart/form-data'
              }
            , multipart: [
                  {
                      body: content
                    , 'Content-Disposition': 'form-data; name="status"'
                  }
                , {
                      body: config.ACCESS_TOKEN
                    , 'Content-Disposition': 'form-data; name="access_token"'
                  }
                , {
                      body: b
                    , 'Content-Disposition': 'form-data; name="pic"; filename="web_screenshot.png"'
                    , 'Content-Type': 'image/png'
                  }
              ]
          }, resfunc('upload fail'))
        }
      })
    }
  })
}
var posted;
getHNItems( function ( items ) {
  try {
    posted = JSON.parse( fs.readFileSync(__dirname+'/posted.data', 'utf-8'));
  } catch ( e ) {
    posted = {};
  }
  l = parseInt(process.argv[2], 10) || 1;
  function next(i) {
    var item = items[i]
    if (!item || i >= l) return
    if (!posted[ item.id ]) {
      posted[ item.id ] = 1;
      fs.writeFileSync(__dirname+'/posted.data', JSON.stringify( posted ));
      postToWeibo( item );
      setTimeout(next, 180000, i+1)
    } else next(i+1)
  }
  next(0)
});
