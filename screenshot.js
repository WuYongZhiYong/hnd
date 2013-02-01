var request = require('request')
  , ss = request.defaults({
        uri: 'http://screener.brachium-system.net/shot'
      , headers: {
            host: 'screener.brachium-system.net'
          , origin: 'http://screener.brachium-system.net'
          , referer: 'http://screener.brachium-system.net/'
        }
    })

var s = module.exports = function(url, f) {
  ss.post({
      form: { url: url }
    , timeout: 30000
  }, function(e, r, body) {
    if (!e) {
      console.log(body);
      try {
        body = JSON.parse(body)
      } catch (ee) {
        e = ee
      }
      if (!body) e = new Error('no body')
      if (body && !body.file) e = new Error('no body.file')
      if (body && body.error) e = new Error(body.error)
    }
    if (e) f(e)
    else request({
        uri: 'http://screener.brachium-system.net/' + body.file
      , encoding: null
      , timeout: 60000
    }, function(e, r, b) {
      if (e) f(e)
      else f(null, b)
    })
  })
}
