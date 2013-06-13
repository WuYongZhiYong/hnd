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
  request({
      uri: 'http://news.ycombinator.com/rss'
  }, function (error, r, body) {
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
  });
}

function postToWeibo( item ) {
  var ellipsis, content
  ellipsis = item.title.length > 220 ? '...' : ''
  content = '《'+item.title.substring(0,220) + ellipsis + '》原文：' +
            encodeURI(item.link).replace(/ /g, '+') +
            ' HN评论：'+encodeURI(item.comments).replace(/ /g, '+')
  var resfunc = function (msg) {
    return function(e, r, body) {
      if (e) {
        console.log('ERROR: ' + msg)
        if (body) console.log(body)
      }
      console.log(item)
    }
  }
  request.post({
      uri: 'https://api.weibo.com/2/statuses/update.json'
    , form: { access_token: config.ACCESS_TOKEN, status: content }
  }, resfunc('update fail'))
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
    item.link = item.link.replace(/\u0000/g, '/')
    item.comments = item.comments.replace(/\u0000/g, '/')
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
