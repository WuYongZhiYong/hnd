var xml = require("node-xml")
  , request = require('request')
  , fs = require('fs')
  , config = JSON.parse(fs.readFileSync(__dirname+'/config.json', 'utf-8'))
  , defaultHeaders = {
        cookie: 'gsid_CTandWM=' + config.gsid + '; ' +
          '_WEIBO_UID=' + config.uid
      , host: 'weibo.cn'
      , referer: 'http://weibo.cn/?gsid=' + config.gsid + '&st=' + config.st
    }
  , weibo = request.defaults({
        uri: 'http://weibo.cn/mblog/sendmblog?gsid=' + config.gsid
      , headers: defaultHeaders
    })
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
  request('http://hackerne.ws/rss', function (error, response, body) {
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
    if (!error && response.statusCode == 200) {
      parser.parseString(body);
    }
  })
}

function postToWeibo( item ) {
  request('http://api.weibo.com/short_url/shorten.json?source=2887826189&url_long=' +
          encodeURIComponent(item.link) + '&url_long=' +
          encodeURIComponent(item.comments), function(e, r, body) {
    var result = JSON.parse(body)
      , ellipsis, content
    if (!result.urls) {
      console.log('=== not posted ===')
      console.log(item)
    } else {
      item.linkShorted = result.urls[0].url_short
      item.commentsShorted = result.urls[1].url_short
      ellipsis = item.title.length > 178 ? '...' : ''
      content = '《'+item.title.substring(0,178) + ellipsis + '》原文：' +
                encodeURI(item.linkShorted).replace(/ /g, '+') +
                ' HN评论：'+encodeURI(item.commentsShorted).replace(/ /g, '+') + ' ' +
                new Date().toUTCString()
      screenshot(item.link, function(e, b) {
        var resfunc = function(e, r, body) {
          if (e || body) console.log('=== not posted ===')
          console.log(item)
        }
        if (e) {
          weibo.post({
              form: { rl: '0', content: content }
          }, resfunc)
        } else {
          weibo.post({
              encoding: 'utf8'
            , headers: copyExtend(defaultHeaders, {
                  'content-type': 'multipart/form-data'
              })
            , multipart: [
                  {
                      body: content
                    , 'Content-Disposition': 'form-data; name="content"'
                  }
                , {
                      body: b
                    , 'Content-Disposition': 'form-data; name="pic"; filename="web_screenshot.png"'
                    , 'Content-Type': 'image/png'
                  }
              ]
          }, resfunc)
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
