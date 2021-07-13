'use strict';

var utils = require('./utils');

var has = Object.prototype.hasOwnProperty;
var isArray = Array.isArray;

var defaults = {
    allowDots: false,
    allowPrototypes: false,
    allowSparse: false,
    arrayLimit: 20,
    charset: 'utf-8',
    charsetSentinel: false,
    comma: false,
    decoder: utils.decode,
    delimiter: '&',
    depth: 5,
    ignoreQueryPrefix: false,
    interpretNumericEntities: false,
    parameterLimit: 1000,
    parseArrays: true,
    plainObjects: false,
    strictNullHandling: false,
};

var interpretNumericEntities = function (str) {
    /**
     * () : 그룹을 표현함
     * \d : 숫자를 의미함
     * + : 반복을 표현함 d문자가 한번 이상 반복됨을 의미한다.
     */
    /**
     * &#123; 형태의 문자열을 변경한다.
     *
     * fromCharCode = UTF-16 코드를 문자열로 변경한다.
     *
     * 예: &#123 -> {
     *
     */
    /**
     * 문제점 : &의 구분자로써 사용이 된다. 따라서 val에 &#123;형태로 값이 들어올 가능성은 전무하다.
     */
    return str.replace(/&#(\d+);/g, function ($0, numberStr) {
        return String.fromCharCode(parseInt(numberStr, 10));
    });
};

/**
 * options.comma가 true인경우 ','가 입력되어 있는 문자열을 배열로 바꾼다.
 */
var parseArrayValue = function (val, options) {
    if (val && typeof val === 'string' && options.comma && val.indexOf(',') > -1) {
        return val.split(',');
    }

    return val;
};

// This is what browsers will submit when the ✓ character occurs in an
// application/x-www-form-urlencoded body and the encoding of the page containing
// the form is iso-8859-1, or when the submitted form has an accept-charset
// attribute of iso-8859-1. Presumably also with other charsets that do not contain
// the ✓ character, such as us-ascii.
var isoSentinel = 'utf8=%26%2310003%3B'; // encodeURIComponent('&#10003;')

// These are the percent-encoded utf-8 octets representing a checkmark, indicating that the request actually is utf-8 encoded.
var charsetSentinel = 'utf8=%E2%9C%93'; // encodeURIComponent('✓')

var parseValues = function parseQueryStringValues(str, options) {
    var obj = {};
    var cleanStr = options.ignoreQueryPrefix ? str.replace(/^\?/, '') : str;
    /**
     * 쿼리의 시작점으로 사용되는 기호 포함 여부를 확인하여
     * 파싱할 문자열을 결정한다.
     *
     * express를 구동시키고 프리픽스테스트용 쿼리(?te?st=123)를 보냈을 때 파싱된 값  = { 'te?st': '123' }
     * qs에 동일한 쿼리(?te?st=123)를 보냈을 때 파싱된 값 = { '?te?st': '123' }
     *
     * express에서 입력받은 url에서 쿼리 부분만 따로 파싱할때 맨 처음 구분자(?)를 없애고(에: te?st=123) 주는걸까?
     */
    var limit = options.parameterLimit === Infinity ? undefined : options.parameterLimit;
    /**
     * 파라미터 제한이 무한대이면 limit값을 설정하지 않는다.
     *
     * 최대 url길이
     *
     * RFC2616 3.2.1
     * The HTTP protocol does not place any a priori limit on the length of a URI.
     * Servers MUST be able to handle the URI of any resource they serve, and SHOULD be able to handle URIs of unbounded length if they provide GET-based forms that could generate such URIs.
     * A server SHOULD return 414 (Request-URI Too Long) status if a URI is longer than the server can handle (see section 10.4.15).
     *
     * => 제한되어 있지 않음 다만, 서버가 다룰수 있는 최대 길이를 넘어가는경우 414에러를 리턴하여야함
     *
     * RFC7230
     *
     * Various ad hoc limitations on request-line length are found in practice.
     * It is RECOMMENDED that all HTTP senders and recipients support, at a minimum, request-line lengths of 8000 octets.
     *
     * => 최소 8000옥텟(=8비트)
     *
     * 실세계의 브라우저은 2000자가 넘어갈 경우 제대로 작동하지 않을수 있다.(2006년 기준)
     *
     * 크롬의 최대 url 길이 = 32779
     *
     * https://stackoverflow.com/questions/417142/what-is-the-maximum-length-of-a-url-in-different-browsers 참고
     *
     * url의 길이는 RFC문서상 제한이 없지만, 호스트명의 경우 256 characters로 제한된다(DNS 제약 때문)
     *
     * url의 길이는 대부분 브라우저와 서버에 따라 다르다
     *
     * node.js에 설정되어 있는 기본 길이는 80kb(Request header + URL)를 넘을 수 없다.
     *
     * -DHTTP_MAX_HEADER_SIZE=<value> 옵션을 통해 바꿀수 있는것 같다.
     *
     * https://github.com/nodejs/http-parser/blob/main/http_parser.h#L55 참고
     *
     */
    var parts = cleanStr.split(options.delimiter, limit);
    /**
     * delimiter : "&"이므로 get query를 qs에서 파싱하는것 같다.
     * limit: 최대 분할 개수
     */
    var skipIndex = -1; // Keep track of where the utf8 sentinel was found
    var i;

    var charset = options.charset;
    if (options.charsetSentinel) {
        for (i = 0; i < parts.length; ++i) {
            if (parts[i].indexOf('utf8=') === 0) {
                /**
                 * indexof : 지정된 요소를 찾은 뒤 첫번째 인덱스를 반환한다.
                 * query가 utf8=로 시작하는 경우만 체크한다.
                 */
                if (parts[i] === charsetSentinel) {
                    charset = 'utf-8';
                } else if (parts[i] === isoSentinel) {
                    charset = 'iso-8859-1';
                }
                skipIndex = i;
                /**
                 * charset을 저장하고 해당 인덱스의 값은 무시한다.
                 */
                i = parts.length; // The eslint settings do not allow break;
            }
        }
    }
    /**
     * charsetSentinel의 값은 false이므로 기본세팅에서는 작동하지 않음
     *
     * 기본 인코딩 설정은 옵션에 설정되어 있는 값(기본값: "utf-8")으로 하고
     * charsetSentinel이 설정되어 있는경우 실제 인코딩 여부를 확인한다.
     */

    for (i = 0; i < parts.length; ++i) {
        if (i === skipIndex) {
            /**
             * i의 경우 기본값 -1이고, utf8= 형식의 쿼리가 발견되었을 경우
             * 해당 쿼리를 무시하는 용도로써 사용된다.
             */
            continue;
        }
        var part = parts[i];

        var bracketEqualsPos = part.indexOf(']=');
        var pos = bracketEqualsPos === -1 ? part.indexOf('=') : bracketEqualsPos + 1;
        /**
         * 굳이 breaketEqualsPos를 찾은뒤 pos를 찾는 이유
         *
         * test[te=st]=123인경우 첫번째 =의 위치가 아닌 두번째 =의 위치를 찾기 위하여
         * 하지만 test[te=st] =123인 경우 첫번째 =의 위치를 찾는다.
         */

        var key, val;
        if (pos === -1) {
            /**
             * =가 없는경우 입력된 값은 key로 설정한다.
             * val의 경우 strictNullHandling이 ture인 경우 null로 설정을 하고 아닌경우 빈 문자열로 설정한다.
             */
            key = options.decoder(part, defaults.decoder, charset, 'key');
            /**
             * options.decoder = utils.decode
             *
             * utils.decode 매개변수는 3개를 받는다. 마지막 인자는 key인지 value인지 구분하기위해 사용하는것 같다.
             * 두번째 인자의 경우 사용하지 않는다. 왜 입력을 받는것일가?
             */
            /**
             * 쿼리에서 '+'는 ' '으로 대체된다.
             *
             * utf-8의 경우 js라이브러리 함수를 통하여 디코딩한다.
             *  -> 디코딩에 실패한경우 '+'를 ' '로 대체한 문자열을 리턴한다.
             *
             * iso-8859-1인경우 이스케이프 문자만 대체하여 리턴한다.
             */
            val = options.strictNullHandling ? null : '';
        } else {
            key = options.decoder(part.slice(0, pos), defaults.decoder, charset, 'key');
            /**
             * '='가 있는경우 '='전까지를 키로 하여 키로 설정한다.
             */
            val = utils.maybeMap(parseArrayValue(part.slice(pos + 1), options), function (encodedVal) {
                return options.decoder(encodedVal, defaults.decoder, charset, 'value');
            });
            /**
             * maybeMap
             *
             * val이 배열인 경우 각각의 값을 배열에 담아 리턴하고
             * 배열이 아닌경우 그냥 리턴한다.
             * 이때 리턴되는 val은 decoder에 의해 디코딩되어 리턴된다.
             *
             */
            /**
             * parseArrayValue
             *
             * options.comma가 true인경우 ','가 입력되어 있는 문자열을 배열로 바꾼다.
             *
             * express에서 options.comma는 false이므로 ','가 있다고 하더라고 배열로 바꾸지 않는다.
             *
             * ?test=1,2,3,4,5 -> { test: '1,2,3,4,5' }
             */
        }

        if (val && options.interpretNumericEntities && charset === 'iso-8859-1') {
            /**
             * express 기본세팅 사용시 해당 조건으로 들어오지 않는다.
             */
            val = interpretNumericEntities(val);
        }

        if (part.indexOf('[]=') > -1) {
            console.log('here');
            val = isArray(val) ? [val] : val;
        }
        /**
         * key가 []=형태일때 val가 배열이면 배열을 배열로 감싼다.
         *
         * 왜?
         *
         * npm i로 설치한 경우 해당 코드가 없다.
         */

        /**
         * ?test[key]=abc,abc 이런 형태도 포함하는줄 알았다.
         *
         * ?test[]=abc,abc 이런 형태만 의미하는것 같다.
         */
        console.log(obj.hasOwnProperty);
        console.log(obj.hasOwnProperty(key));
        console.log(has.call(obj, key));
        console.log(key);

        if (has.call(obj, key)) {
            console.log(obj.hasOwnProperty);
            obj[key] = utils.combine(obj[key], val);
            console.log(obj.hasOwnProperty);
        } else {
            obj[key] = val;
        }
        /**
         * obejct가 key에 해당하는 프로퍼티를 가지고 있는지 여부
         */
    }

    return obj;
};

var parseObject = function (chain, val, options, valuesParsed) {
    var leaf = valuesParsed ? val : parseArrayValue(val, options);

    for (var i = chain.length - 1; i >= 0; --i) {
        var obj;
        var root = chain[i];

        if (root === '[]' && options.parseArrays) {
            obj = [].concat(leaf);
        } else {
            obj = options.plainObjects ? Object.create(null) : {};
            var cleanRoot = root.charAt(0) === '[' && root.charAt(root.length - 1) === ']' ? root.slice(1, -1) : root;
            var index = parseInt(cleanRoot, 10);
            if (!options.parseArrays && cleanRoot === '') {
                obj = { 0: leaf };
            } else if (!isNaN(index) && root !== cleanRoot && String(index) === cleanRoot && index >= 0 && options.parseArrays && index <= options.arrayLimit) {
                obj = [];
                obj[index] = leaf;
            } else {
                obj[cleanRoot] = leaf;
            }
        }

        leaf = obj;
    }

    return leaf;
};

var parseKeys = function parseQueryStringKeys(givenKey, val, options, valuesParsed) {
    if (!givenKey) {
        return;
    }

    // Transform dot notation to bracket notation
    var key = options.allowDots ? givenKey.replace(/\.([^.[]+)/g, '[$1]') : givenKey;

    // The regex chunks

    var brackets = /(\[[^[\]]*])/;
    var child = /(\[[^[\]]*])/g;

    // Get the parent

    var segment = options.depth > 0 && brackets.exec(key);
    var parent = segment ? key.slice(0, segment.index) : key;

    // Stash the parent if it exists

    var keys = [];
    if (parent) {
        // If we aren't using plain objects, optionally prefix keys that would overwrite object prototype properties
        if (!options.plainObjects && has.call(Object.prototype, parent)) {
            if (!options.allowPrototypes) {
                return;
            }
        }

        keys.push(parent);
    }

    // Loop through children appending to the array until we hit depth

    var i = 0;
    while (options.depth > 0 && (segment = child.exec(key)) !== null && i < options.depth) {
        i += 1;
        if (!options.plainObjects && has.call(Object.prototype, segment[1].slice(1, -1))) {
            if (!options.allowPrototypes) {
                return;
            }
        }
        keys.push(segment[1]);
    }

    // If there's a remainder, just add whatever is left

    if (segment) {
        keys.push('[' + key.slice(segment.index) + ']');
    }

    return parseObject(keys, val, options, valuesParsed);
};

var normalizeParseOptions = function normalizeParseOptions(opts) {
    if (!opts) {
        return defaults;
    }

    /**
     * parser에 str만 들어오고 opts가 들어오지 않은경우
     * 기본 옵션으로 설정한다.
     */

    if (opts.decoder !== null && opts.decoder !== undefined && typeof opts.decoder !== 'function') {
        throw new TypeError('Decoder has to be a function.');
    }
    /**
     * decoder가 함수가 아닌경우 에러를 리턴한다.
     */

    if (typeof opts.charset !== 'undefined' && opts.charset !== 'utf-8' && opts.charset !== 'iso-8859-1') {
        throw new TypeError('The charset option must be either utf-8, iso-8859-1, or undefined');
    }
    /**
     * 문자셋은 utf-8이거나 iso-8859-1 undefined이어야 한다.
     *
     * iso-8859-1 : 첫 256개의 유니코드 문자를 나타낼 수 있는 1바이트 인코딩
     *
     * utf-8 iso-8859-1 모두 ascii를 같은 방식으로 인코딩한다.
     */
    var charset = typeof opts.charset === 'undefined' ? defaults.charset : opts.charset;
    /**
     * charset이 undefined인 경우 utf-8로 설정한다.
     */

    /**
     * 조건에 따라 defaults와 opts중 적절한 값을 선택한다.
     */
    return {
        allowDots: typeof opts.allowDots === 'undefined' ? defaults.allowDots : !!opts.allowDots,
        allowPrototypes: typeof opts.allowPrototypes === 'boolean' ? opts.allowPrototypes : defaults.allowPrototypes,
        allowSparse: typeof opts.allowSparse === 'boolean' ? opts.allowSparse : defaults.allowSparse,
        arrayLimit: typeof opts.arrayLimit === 'number' ? opts.arrayLimit : defaults.arrayLimit,
        charset: charset,
        charsetSentinel: typeof opts.charsetSentinel === 'boolean' ? opts.charsetSentinel : defaults.charsetSentinel,
        comma: typeof opts.comma === 'boolean' ? opts.comma : defaults.comma,
        decoder: typeof opts.decoder === 'function' ? opts.decoder : defaults.decoder,
        delimiter: typeof opts.delimiter === 'string' || utils.isRegExp(opts.delimiter) ? opts.delimiter : defaults.delimiter,
        // eslint-disable-next-line no-implicit-coercion, no-extra-parens
        depth: typeof opts.depth === 'number' || opts.depth === false ? +opts.depth : defaults.depth,
        ignoreQueryPrefix: opts.ignoreQueryPrefix === true,
        interpretNumericEntities: typeof opts.interpretNumericEntities === 'boolean' ? opts.interpretNumericEntities : defaults.interpretNumericEntities,
        parameterLimit: typeof opts.parameterLimit === 'number' ? opts.parameterLimit : defaults.parameterLimit,
        parseArrays: opts.parseArrays !== false,
        plainObjects: typeof opts.plainObjects === 'boolean' ? opts.plainObjects : defaults.plainObjects,
        strictNullHandling: typeof opts.strictNullHandling === 'boolean' ? opts.strictNullHandling : defaults.strictNullHandling,
    };
};

module.exports = function (str, opts) {
    var options = normalizeParseOptions(opts);
    /**
     * {
     *  allowDots: false,
     *  allowPrototypes: true,
     *  arrayLimit: 20,
     *  charset: 'utf-8',
     *  charsetSentinel: false,
     *  comma: false,
     *  decoder: [Function: decode],
     *  delimiter: '&',
     *  depth: 5,
     *  ignoreQueryPrefix: false,
     *  interpretNumericEntities: false,
     *  parameterLimit: 1000,
     *  parseArrays: true,
     *  plainObjects: false,
     *  strictNullHandling: false
     * }
     *
     * opts = { allowPrototypes : true };인 경우 options세팅값
     */

    if (str === '' || str === null || typeof str === 'undefined') {
        return options.plainObjects ? Object.create(null) : {};
        /**
         * 기본값의 경우 false이므로 빈 개체({})를 리턴한다.
         */

        /**
         * {}와 Object.create(null)의 차이
         *
         * {}.constructor.prototype === Object.prototype이지만
         * Object.create(null)의 경우 아무것도 상속받지 않는다.
         *
         * {} === Object.create(Object.prototype)을 의미함
         */
    }
    /**
     * str에 빈 문자열 null undefined가 들어온 경우
     */

    var tempObj = typeof str === 'string' ? parseValues(str, options) : str;
    /**
     * 문자열인경우 쿼리를 개체로 만든다.
     */
    var obj = options.plainObjects ? Object.create(null) : {};

    // Iterate over the keys and setup the new object

    var keys = Object.keys(tempObj);
    /**
     * tempObj가 숫자인경우 keys = []; 빈 배열을 리턴한다.
     */
    for (var i = 0; i < keys.length; ++i) {
        var key = keys[i];
        var newObj = parseKeys(key, tempObj[key], options, typeof str === 'string');
        obj = utils.merge(obj, newObj, options);
    }

    if (options.allowSparse === true) {
        return obj;
    }

    return utils.compact(obj);
};
