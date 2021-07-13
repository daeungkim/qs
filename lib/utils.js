'use strict';

var formats = require('./formats');

var has = Object.prototype.hasOwnProperty;
var isArray = Array.isArray;

var hexTable = (function () {
    var array = [];
    for (var i = 0; i < 256; ++i) {
        array.push('%' + ((i < 16 ? '0' : '') + i.toString(16)).toUpperCase());
    }

    return array;
})();

var compactQueue = function compactQueue(queue) {
    while (queue.length > 1) {
        var item = queue.pop();
        var obj = item.obj[item.prop];

        if (isArray(obj)) {
            var compacted = [];

            for (var j = 0; j < obj.length; ++j) {
                if (typeof obj[j] !== 'undefined') {
                    compacted.push(obj[j]);
                }
            }

            item.obj[item.prop] = compacted;
        }
    }
};

var arrayToObject = function arrayToObject(source, options) {
    var obj = options && options.plainObjects ? Object.create(null) : {};
    for (var i = 0; i < source.length; ++i) {
        if (typeof source[i] !== 'undefined') {
            obj[i] = source[i];
        }
    }

    return obj;
};

var merge = function merge(target, source, options) {
    /* eslint no-param-reassign: 0 */
    if (!source) {
        return target;
    }

    if (typeof source !== 'object') {
        if (isArray(target)) {
            target.push(source);
        } else if (target && typeof target === 'object') {
            if ((options && (options.plainObjects || options.allowPrototypes)) || !has.call(Object.prototype, source)) {
                target[source] = true;
            }
        } else {
            return [target, source];
        }

        return target;
    }

    if (!target || typeof target !== 'object') {
        return [target].concat(source);
    }

    var mergeTarget = target;
    if (isArray(target) && !isArray(source)) {
        mergeTarget = arrayToObject(target, options);
    }

    if (isArray(target) && isArray(source)) {
        source.forEach(function (item, i) {
            if (has.call(target, i)) {
                var targetItem = target[i];
                if (targetItem && typeof targetItem === 'object' && item && typeof item === 'object') {
                    target[i] = merge(targetItem, item, options);
                } else {
                    target.push(item);
                }
            } else {
                target[i] = item;
            }
        });
        return target;
    }

    return Object.keys(source).reduce(function (acc, key) {
        var value = source[key];

        if (has.call(acc, key)) {
            acc[key] = merge(acc[key], value, options);
        } else {
            acc[key] = value;
        }
        return acc;
    }, mergeTarget);
};

var assign = function assignSingleSource(target, source) {
    return Object.keys(source).reduce(function (acc, key) {
        acc[key] = source[key];
        return acc;
    }, target);
};

var decode = function (str, decoder, charset) {
    var strWithoutPlus = str.replace(/\+/g, ' ');
    /**
     * '+'를 ' '로 대체한다.
     */
    if (charset === 'iso-8859-1') {
        // unescape never throws, no try...catch needed:
        /**
         * [0-9a-f] : 0 ~ f까지의 숫자 16진수
         * {2} : 앞의 표현식이 2번 나타나는 부분에대응
         *
         * 이스케이프 코드를 의미하는것 같다.
         *
         * c에서의 이스케이프 코드는 16진수 두자리로 표현이 됨
         * \a == 07
         * \b == 08
         *
         * url에서의 이스케이프 코드 예 :
         * < = %3C
         * > = %3E
         */

        /**
         * 하지만 문자열 리터럴에서 이스케이프 코드를 사용하려는 경우 %가 아닌 $를 사용해야한다.
         * query=title%20EQ%20"$3CMy title$3E" -> O
         * query=title%20EQ%20'%3CMy title%3E' -> X
         *
         * https://docs.microfocus.com/OMi/10.62/Content/OMi/ExtGuide/ExtApps/URL_encoding.htm 참고
         *
         * 라고 되어있는데 실제 express에서 쿼리 파싱한 결과를 보면
         * ?test=%3C"$3C" -> { test: '<"$3C"' }
         * ?test=%3C"%3C" -> { test: '<"<"' }
         * 로 나온다.
         *
         * 공식 문서가 아니라 오류가 있는것일수도 있다.
         *
         * 사실 코드상에서도 문자열 리터럴 안에 있는 $로 시작하는 이스케이프 문자를 처리하는 부분이 없기는 하다.
         */
        return strWithoutPlus.replace(/%[0-9a-f]{2}/gi, unescape);
        /**
         * unescape함수는 hexadecimal escape sequences(=%3C)를 실제 문자 '<'로 대체한다.
         *
         * 예 ?test=%3C -> {"test":"<"}
         */
    }
    /**
     * 문자셋이 iso-8859-1인경우 이스케이프 문자만 실제 문자열에 맞게 대체한다.
     */
    // utf-8
    try {
        return decodeURIComponent(strWithoutPlus);
        /**
         * utf-8인 경우
         *
         * uri를 디코딩하여 리턴한다.
         *
         * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/decodeURIComponent 참고
         */
    } catch (e) {
        return strWithoutPlus;
    }
};

var encode = function encode(str, defaultEncoder, charset, kind, format) {
    // This code was originally written by Brian White (mscdex) for the io.js core querystring library.
    // It has been adapted here for stricter adherence to RFC 3986
    if (str.length === 0) {
        return str;
    }

    var string = str;
    if (typeof str === 'symbol') {
        string = Symbol.prototype.toString.call(str);
    } else if (typeof str !== 'string') {
        string = String(str);
    }

    if (charset === 'iso-8859-1') {
        return escape(string).replace(/%u[0-9a-f]{4}/gi, function ($0) {
            return '%26%23' + parseInt($0.slice(2), 16) + '%3B';
        });
    }

    var out = '';
    for (var i = 0; i < string.length; ++i) {
        var c = string.charCodeAt(i);

        if (
            c === 0x2d || // -
            c === 0x2e || // .
            c === 0x5f || // _
            c === 0x7e || // ~
            (c >= 0x30 && c <= 0x39) || // 0-9
            (c >= 0x41 && c <= 0x5a) || // a-z
            (c >= 0x61 && c <= 0x7a) || // A-Z
            (format === formats.RFC1738 && (c === 0x28 || c === 0x29)) // ( )
        ) {
            out += string.charAt(i);
            continue;
        }

        if (c < 0x80) {
            out = out + hexTable[c];
            continue;
        }

        if (c < 0x800) {
            out = out + (hexTable[0xc0 | (c >> 6)] + hexTable[0x80 | (c & 0x3f)]);
            continue;
        }

        if (c < 0xd800 || c >= 0xe000) {
            out = out + (hexTable[0xe0 | (c >> 12)] + hexTable[0x80 | ((c >> 6) & 0x3f)] + hexTable[0x80 | (c & 0x3f)]);
            continue;
        }

        i += 1;
        c = 0x10000 + (((c & 0x3ff) << 10) | (string.charCodeAt(i) & 0x3ff));
        out += hexTable[0xf0 | (c >> 18)] + hexTable[0x80 | ((c >> 12) & 0x3f)] + hexTable[0x80 | ((c >> 6) & 0x3f)] + hexTable[0x80 | (c & 0x3f)];
    }

    return out;
};

var compact = function compact(value) {
    var queue = [{ obj: { o: value }, prop: 'o' }];
    var refs = [];

    for (var i = 0; i < queue.length; ++i) {
        var item = queue[i];
        var obj = item.obj[item.prop];

        var keys = Object.keys(obj);
        for (var j = 0; j < keys.length; ++j) {
            var key = keys[j];
            var val = obj[key];
            if (typeof val === 'object' && val !== null && refs.indexOf(val) === -1) {
                queue.push({ obj: obj, prop: key });
                refs.push(val);
            }
        }
    }

    compactQueue(queue);

    return value;
};

var isRegExp = function isRegExp(obj) {
    return Object.prototype.toString.call(obj) === '[object RegExp]';
};

var isBuffer = function isBuffer(obj) {
    if (!obj || typeof obj !== 'object') {
        return false;
    }

    return !!(obj.constructor && obj.constructor.isBuffer && obj.constructor.isBuffer(obj));
};

/**
 * [].concat(a, b);
 *
 * [], a, b 세 배열을 합친다.
 */
var combine = function combine(a, b) {
    return [].concat(a, b);
};

/**
 * maybeMap
 *
 * val이 배열인 경우 각각의 값을 배열에 담아 리턴하고
 * 배열이 아닌경우 그냥 리턴한다.
 * 이때 리턴되는 val은 decoder에 의해 디코딩되어 리턴된다.
 *
 */
var maybeMap = function maybeMap(val, fn) {
    if (isArray(val)) {
        var mapped = [];
        for (var i = 0; i < val.length; i += 1) {
            mapped.push(fn(val[i]));
        }
        return mapped;
    }
    return fn(val);
};

module.exports = {
    arrayToObject: arrayToObject,
    assign: assign,
    combine: combine,
    compact: compact,
    decode: decode,
    encode: encode,
    isBuffer: isBuffer,
    isRegExp: isRegExp,
    maybeMap: maybeMap,
    merge: merge,
};
