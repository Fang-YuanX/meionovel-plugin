"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
var fetch_1 = require("@libs/fetch");
var novelStatus_1 = require("@libs/novelStatus");
var cheerio_1 = require("cheerio");
var SITE = "https://meionovels.com/";
var REQUEST_HEADERS = {
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8",
};
var normalizePath = function (path) {
    return path
        .replace(/^https?:\/\/[^/]+/i, "")
        .split(/[?#]/, 1)[0]
        .replace(/^\/+|\/+$/g, "");
};
var getNovelPath = function (href) {
    var path = normalizePath(href);
    var match = path.match(/^novel\/([^/]+)$/i);
    return match ? "novel/".concat(match[1], "/") : undefined;
};
var getChapterPath = function (href) {
    var path = normalizePath(href);
    return path.startsWith("novel/") ? path : undefined;
};
var isUsableUrl = function (url) {
    return !!url && url.trim() !== "" && !/^data:/i.test(url.trim());
};
var absoluteUrl = function (url) {
    var value = url.trim();
    if (/^https?:\/\//i.test(value))
        return value;
    if (value.startsWith("//"))
        return "https:".concat(value);
    if (value.startsWith("/"))
        return "".concat(SITE).concat(value.slice(1));
    return "".concat(SITE).concat(value);
};
var firstFromSrcset = function (srcset) { var _a; return (_a = srcset === null || srcset === void 0 ? void 0 : srcset.split(",")[0]) === null || _a === void 0 ? void 0 : _a.trim().split(/\s+/)[0]; };
var getCover = function (element) {
    var image = element.find("img").first();
    var found = [
        image.attr("data-lazy-src"),
        image.attr("data-src"),
        image.attr("data-cfsrc"),
        firstFromSrcset(image.attr("data-lazy-srcset")),
        firstFromSrcset(image.attr("data-srcset")),
        firstFromSrcset(image.attr("srcset")),
        image.attr("src"),
    ].find(isUsableUrl);
    return found ? absoluteUrl(found) : undefined;
};
var CARD_SELECTOR = ".page-item-detail, .c-tabs-item__content, .novel-item, article";
var NAV_CHAPTER_RE = /^[►▶▸\s]*(mulai baca|baca terbaru|start reading|read first|read last|first chapter|latest chapter)/i;
var chapterNumberOf = function (rest) {
    var last = rest.split("/").pop() || "";
    var match = last.match(/(\d+(?:\.\d+)?)(?!.*\d)/);
    return match ? Number(match[1]) : undefined;
};
var prettyChapterName = function (rest) {
    return rest
        .split("/")
        .filter(Boolean)
        .map(function (segment) {
        return segment
            .replace(/[-_]+/g, " ")
            .replace(/\b\w/g, function (char) { return char.toUpperCase(); });
    })
        .join(" ")
        .replace(/\bMtl\b/g, "MTL");
};
var labelOf = function ($, element) {
    var el = $(element);
    var tag = String(el.prop("tagName") || "?").toLowerCase();
    var cls = (el.attr("class") || "").trim().split(/\s+/)[0];
    var id = el.attr("id");
    return "".concat(tag).concat(cls ? "." + cls : "").concat(id ? "#" + id : "");
};
var PLACEHOLDER_RE = /Memuat isi chapter|Memuat daftar isi|Muat ulang halaman/i;
var rankContainers = function ($) {
    var candidates = [];
    $("article, main, section, div, td").each(function (_, element) {
        var el = $(element);
        var score = 0;
        el.children("p").each(function (__, p) {
            score += $(p).text().trim().length;
        });
        if (el.children("br").length > 3) {
            score += el.clone().children().remove().end().text().trim().length;
        }
        if (score > 0) {
            candidates.push({ el: el, score: score, label: "".concat(labelOf($, element), ":").concat(score) });
        }
    });
    return candidates.sort(function (a, b) { return b.score - a.score; });
};
var escapeHtml = function (text) {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
};
var apiHeaders = function (referer) { return ({
    Accept: "application/json, text/plain, */*",
    "X-Requested-With": "XMLHttpRequest",
    Referer: referer,
}); };
var jsonChaptersOf = function (json, base, novelSlug) {
    var out = [];
    var nameKeys = ["title", "name", "chapter_title", "chapter_name", "label"];
    var pathKeys = [
        "url",
        "href",
        "link",
        "path",
        "permalink",
        "slug",
        "chapter_slug",
    ];
    var walk = function (node) {
        if (Array.isArray(node)) {
            node.forEach(walk);
            return;
        }
        if (!node || typeof node !== "object")
            return;
        var obj = node;
        var path;
        for (var _i = 0, pathKeys_1 = pathKeys; _i < pathKeys_1.length; _i++) {
            var key = pathKeys_1[_i];
            var value = obj[key];
            if (typeof value !== "string" || !value)
                continue;
            var normalized = normalizePath(value);
            if (normalized.startsWith(base)) {
                path = normalized;
                break;
            }
            if (key.includes("slug") &&
                value !== novelSlug &&
                /^[A-Za-z0-9_\-]+$/.test(value)) {
                path = "".concat(base).concat(value);
                break;
            }
        }
        if (path) {
            var nameKey = nameKeys.find(function (k) { return typeof obj[k] === "string" && obj[k]; });
            out.push({ path: path, name: nameKey ? String(obj[nameKey]) : undefined });
        }
        Object.values(obj).forEach(walk);
    };
    walk(json);
    return out;
};
var contentFromJson = function (json) {
    var bestString = "";
    var bestArray = "";
    var walk = function (node) {
        if (typeof node === "string") {
            if (node.length > bestString.length)
                bestString = node;
        }
        else if (Array.isArray(node)) {
            if (node.length > 3 && node.every(function (item) { return typeof item === "string"; })) {
                var joined = node.join("\n\n");
                if (joined.length > bestArray.length)
                    bestArray = joined;
            }
            node.forEach(walk);
        }
        else if (node && typeof node === "object") {
            Object.values(node).forEach(walk);
        }
    };
    walk(json);
    return bestArray.length > bestString.length ? bestArray : bestString;
};
var contentToHtml = function (content) {
    return /<p[\s>]/i.test(content)
        ? content
        : content
            .split(/\r?\n\s*\r?\n|\r?\n/)
            .map(function (block) { return block.trim(); })
            .filter(Boolean)
            .map(function (block) { return "<p>".concat(escapeHtml(block), "</p>"); })
            .join("");
};
var B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
var b64decode = function (input) {
    var clean = input.replace(/[^A-Za-z0-9+/]/g, "");
    var out = new Uint8Array(Math.floor((clean.length * 3) / 4));
    var buffer = 0;
    var bits = 0;
    var index = 0;
    for (var i = 0; i < clean.length; i++) {
        buffer = (buffer << 6) | B64.indexOf(clean.charAt(i));
        bits += 6;
        if (bits >= 8) {
            bits -= 8;
            out[index++] = (buffer >> bits) & 0xff;
        }
    }
    return out;
};
var utf8Decode = function (bytes) {
    var out = "";
    var i = 0;
    while (i < bytes.length) {
        var b = bytes[i++];
        if (b < 0x80) {
            out += String.fromCharCode(b);
        }
        else if (b >= 0xc0 && b < 0xe0) {
            out += String.fromCharCode(((b & 0x1f) << 6) | (bytes[i++] & 0x3f));
        }
        else if (b >= 0xe0 && b < 0xf0) {
            out += String.fromCharCode(((b & 0x0f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f));
        }
        else if (b >= 0xf0 && b < 0xf8) {
            var cp = ((b & 0x07) << 18) |
                ((bytes[i++] & 0x3f) << 12) |
                ((bytes[i++] & 0x3f) << 6) |
                (bytes[i++] & 0x3f);
            var v = cp - 0x10000;
            out += String.fromCharCode(0xd800 + (v >> 10), 0xdc00 + (v & 0x3ff));
        }
        else {
            out += "\ufffd";
        }
    }
    return out;
};
// Salinan logika go() di app.js situs: {k: kunci base64, p: [[offset, base64], ...]}
var decodePayload = function (data) {
    var key = b64decode(String(data.k));
    var parts = data.p
        .slice()
        .sort(function (a, b) { return Number(a[0]) - Number(b[0]); })
        .map(function (_a) {
        var offset = _a[0], chunk = _a[1];
        return ({ offset: Number(offset), bytes: b64decode(chunk) });
    });
    var total = 0;
    parts.forEach(function (part) { return (total += part.bytes.length); });
    var all = new Uint8Array(total);
    var position = 0;
    parts.forEach(function (part) {
        for (var o = 0; o < part.bytes.length; o++) {
            all[position++] = key.length
                ? part.bytes[o] ^ key[(o + part.offset) % key.length]
                : part.bytes[o];
        }
    });
    return utf8Decode(all);
};
var decodeJs = function (value) {
    return value
        .replace(/\\u([0-9a-fA-F]{4})/g, function (_, hex) {
        return String.fromCharCode(parseInt(hex, 16));
    })
        .replace(/\\\//g, "/")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\");
};
// Baca konfigurasi gaya {key: "nilai", key2: 123} dari atribut x-data / script
var readConfig = function (source, keys) {
    var text = source
        .replace(/\\u0022/gi, '"')
        .replace(/\\u0027/gi, "'")
        .replace(/\\u0026/gi, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#0?39;/g, "'")
        .replace(/&amp;/g, "&");
    var out = {};
    keys.forEach(function (key) {
        var re = new RegExp("(?:^|[^A-Za-z0-9_$])[\"']?" +
            key +
            "[\"']?\\s*:\\s*(?:\"((?:[^\"\\\\]|\\\\.)*)\"|'((?:[^'\\\\]|\\\\.)*)'|(-?\\d+(?:\\.\\d+)?)|(null|true|false))");
        var match = re.exec(text);
        if (!match)
            return;
        if (match[1] !== undefined)
            out[key] = decodeJs(match[1]);
        else if (match[2] !== undefined)
            out[key] = decodeJs(match[2]);
        else if (match[3] !== undefined)
            out[key] = match[3];
    });
    return out;
};
var asIdValue = function (value) {
    return value === undefined ? undefined : /^-?\d+$/.test(value) ? Number(value) : value;
};
var MeioNovelCustomPlugin = /** @class */ (function () {
    function MeioNovelCustomPlugin() {
        this.id = "meionovel";
        this.name = "MeioNovel Custom";
        this.icon = "src/id/meionovel/icon.png";
        this.site = SITE;
        this.version = "3.1.0";
        this.imageRequestInit = {
            headers: { Referer: SITE },
        };
        this.seenPaths = new Map();
        this.resolveUrl = function (path) {
            return /^https?:\/\//i.test(path) ? path : "".concat(SITE).concat(normalizePath(path), "/");
        };
    }
    MeioNovelCustomPlugin.prototype.getHtml = function (url, init) {
        return __awaiter(this, void 0, Promise, function () {
            var response, html, title;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, (0, fetch_1.fetchApi)(url, __assign(__assign({}, init), { headers: __assign(__assign({}, REQUEST_HEADERS), init === null || init === void 0 ? void 0 : init.headers) }))];
                    case 1:
                        response = _b.sent();
                        if (!response.ok) {
                            throw new Error("MeioNovel request failed (".concat(response.status, "): ").concat(url));
                        }
                        return [4 /*yield*/, response.text()];
                    case 2:
                        html = _b.sent();
                        title = ((_a = html.match(/<title[^>]*>([^<]*)<\/title>/i)) === null || _a === void 0 ? void 0 : _a[1]) || "";
                        if (/just a moment|bot verification|captcha|verify you are human/i.test(title)) {
                            throw new Error("MeioNovel blocked the request; open the source in WebView first.");
                        }
                        return [2 /*return*/, { html: html, $: (0, cheerio_1.load)(html) }];
                }
            });
        });
    };
    MeioNovelCustomPlugin.prototype.parseNovels = function ($) {
        var novels = new Map();
        var findScope = function (link) {
            var card = link.closest(CARD_SELECTOR);
            if (card.length)
                return card;
            var node = link;
            var _loop_1 = function (i) {
                node = node.parent();
                if (!node.length)
                    return "break";
                var paths = new Set();
                node.find("a[href]").each(function (_, a) {
                    var p = getNovelPath($(a).attr("href") || "");
                    if (p)
                        paths.add(p);
                });
                if (paths.size === 1 && node.find("img").length)
                    return { value: node };
            };
            for (var i = 0; i < 2; i++) {
                var state_1 = _loop_1(i);
                if (typeof state_1 === "object")
                    return state_1.value;
                if (state_1 === "break")
                    break;
            }
            return link;
        };
        var resultSelector = [
            ".c-tabs-item__content",
            ".page-item-detail",
            ".novel-item",
        ].find(function (selector) { return $(selector).length > 0; });
        var anchors = resultSelector
            ? $(resultSelector).find("a[href]")
            : $("a[href]");
        anchors.each(function (_, element) {
            var _a, _b;
            var link = $(element);
            var path = getNovelPath(link.attr("href") || "");
            if (!path)
                return;
            var scope = findScope(link);
            var inCard = scope.is(CARD_SELECTOR);
            var name = (inCard
                ? scope.find(".post-title, h3, h2").first().text().trim()
                : "") ||
                ((_a = link.attr("title")) === null || _a === void 0 ? void 0 : _a.trim()) ||
                link.text().trim() ||
                ((_b = scope.find("img").first().attr("alt")) === null || _b === void 0 ? void 0 : _b.trim()) ||
                "";
            var cover = getCover(scope);
            var existing = novels.get(path);
            if (existing) {
                if (!existing.cover && cover)
                    existing.cover = cover;
                if (!existing.name && name)
                    existing.name = name;
                return;
            }
            if (!name)
                return;
            novels.set(path, { name: name, path: path, cover: cover });
        });
        return Array.from(novels.values());
    };
    MeioNovelCustomPlugin.prototype.dedupe = function (key, pageNo, novels) {
        if (pageNo <= 1 || !this.seenPaths.has(key)) {
            this.seenPaths.set(key, new Set());
        }
        var seen = this.seenPaths.get(key);
        return novels.filter(function (novel) {
            if (seen.has(novel.path))
                return false;
            seen.add(novel.path);
            return true;
        });
    };
    MeioNovelCustomPlugin.prototype.parseChapters = function (html, novelPath) {
        var $ = (0, cheerio_1.load)(html);
        var chapters = [];
        var seen = new Set();
        var push = function (link, releaseTime) {
            var path = getChapterPath(link.attr("href") || "");
            var name = link.text().replace(/\s+/g, " ").trim();
            if (!path || !name || seen.has(path))
                return;
            if (NAV_CHAPTER_RE.test(name))
                return;
            seen.add(path);
            chapters.push({ name: name, path: path, releaseTime: releaseTime || undefined });
        };
        $(".wp-manga-chapter, .chapter-item").each(function (_, element) {
            var chapter = $(element);
            push(chapter.find("a").first(), chapter.find(".chapter-release-date").text().trim());
        });
        if (!chapters.length) {
            var prefix_1 = "".concat(novelPath, "/");
            $("a[href]").each(function (_, element) {
                var link = $(element);
                var path = getChapterPath(link.attr("href") || "");
                if (!path || !path.startsWith(prefix_1))
                    return;
                push(link);
            });
        }
        return chapters.reverse().map(function (chapter, index) { return (__assign(__assign({}, chapter), { chapterNumber: index + 1 })); });
    };
    MeioNovelCustomPlugin.prototype.postForm = function (url, body, referer) {
        return __awaiter(this, void 0, Promise, function () {
            var response, _a, error_1;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _b.trys.push([0, 5, , 6]);
                        return [4 /*yield*/, (0, fetch_1.fetchApi)(url, {
                                method: "POST",
                                headers: __assign(__assign({}, REQUEST_HEADERS), { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", "X-Requested-With": "XMLHttpRequest", Referer: referer }),
                                body: body,
                            })];
                    case 1:
                        response = _b.sent();
                        if (!response.ok) return [3 /*break*/, 3];
                        return [4 /*yield*/, response.text()];
                    case 2:
                        _a = _b.sent();
                        return [3 /*break*/, 4];
                    case 3:
                        _a = "";
                        _b.label = 4;
                    case 4: return [2 /*return*/, _a];
                    case 5:
                        error_1 = _b.sent();
                        return [2 /*return*/, ""];
                    case 6: return [2 /*return*/];
                }
            });
        });
    };
    MeioNovelCustomPlugin.prototype.getChapterHtml = function (endpoint, novelUrl) {
        return __awaiter(this, void 0, Promise, function () {
            var fetchPage, html, $, pageLinks, pageNumbers, maxPage, lastHref, queryIndex, queryTemplate, pageUrls, index, batch, pages;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        fetchPage = function (url) { return __awaiter(_this, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                return [2 /*return*/, (0, fetch_1.fetchApi)(url, {
                                        method: "POST",
                                        headers: REQUEST_HEADERS,
                                        referrer: novelUrl,
                                    })
                                        .then(function (response) { return (response.ok ? response.text() : ""); })
                                        .catch(function () { return ""; })];
                            });
                        }); };
                        return [4 /*yield*/, fetchPage(endpoint)];
                    case 1:
                        html = _a.sent();
                        if (!html || html === "0")
                            return [2 /*return*/, ""];
                        $ = (0, cheerio_1.load)(html);
                        pageLinks = $(".pagination a[data-page]");
                        pageNumbers = pageLinks
                            .map(function (_, element) {
                            return Number.parseInt($(element).attr("data-page") || "", 10);
                        })
                            .get()
                            .filter(function (page) { return Number.isFinite(page) && page > 1; });
                        maxPage = Math.max.apply(Math, __spreadArray([1], pageNumbers, false));
                        lastHref = pageLinks.last().attr("href") || "";
                        queryIndex = lastHref.indexOf("?");
                        if (maxPage === 1 || queryIndex === -1)
                            return [2 /*return*/, html];
                        queryTemplate = lastHref.slice(queryIndex).replace(/\d+$/, "");
                        pageUrls = Array.from({ length: maxPage - 1 }, function (_, index) { return "".concat(endpoint).concat(queryTemplate).concat(index + 2); });
                        index = 0;
                        _a.label = 2;
                    case 2:
                        if (!(index < pageUrls.length)) return [3 /*break*/, 5];
                        batch = pageUrls.slice(index, index + 6);
                        return [4 /*yield*/, Promise.all(batch.map(fetchPage))];
                    case 3:
                        pages = _a.sent();
                        html += pages.filter(function (page) { return page && page !== "0"; }).join("");
                        _a.label = 4;
                    case 4:
                        index += 6;
                        return [3 /*break*/, 2];
                    case 5: return [2 /*return*/, html];
                }
            });
        });
    };
    MeioNovelCustomPlugin.prototype.popularNovels = function (pageNo, options) {
        return __awaiter(this, void 0, Promise, function () {
            var order, $, error_2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        order = (options === null || options === void 0 ? void 0 : options.showLatestNovels) ? "latest" : "views";
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, this.getHtml("".concat(SITE, "novel/page/").concat(pageNo, "/?m_orderby=").concat(order))];
                    case 2:
                        $ = (_a.sent()).$;
                        return [2 /*return*/, this.dedupe("popular:".concat(order), pageNo, this.parseNovels($))];
                    case 3:
                        error_2 = _a.sent();
                        if (pageNo > 1 && /\(404\)/.test(String(error_2 === null || error_2 === void 0 ? void 0 : error_2.message))) {
                            return [2 /*return*/, []];
                        }
                        throw error_2;
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    MeioNovelCustomPlugin.prototype.searchNovels = function (searchTerm, pageNo) {
        return __awaiter(this, void 0, Promise, function () {
            var query, $, error_3;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        query = encodeURIComponent(searchTerm);
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, this.getHtml("".concat(SITE, "page/").concat(pageNo, "/?s=").concat(query, "&post_type=wp-manga"))];
                    case 2:
                        $ = (_a.sent()).$;
                        return [2 /*return*/, this.dedupe("search:".concat(query), pageNo, this.parseNovels($))];
                    case 3:
                        error_3 = _a.sent();
                        if (pageNo > 1 && /\(404\)/.test(String(error_3 === null || error_3 === void 0 ? void 0 : error_3.message))) {
                            return [2 /*return*/, []];
                        }
                        throw error_3;
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    MeioNovelCustomPlugin.prototype.discoverChapters = function (html, cleanPath, known) {
        var slug = cleanPath.replace(/^novel\//, "").replace(/\/+$/, "");
        var base = "novel/".concat(slug, "/");
        var names = new Map();
        var order = [];
        var add = function (path, name) {
            var clean = path.replace(/\/+$/, "");
            var rest = clean.slice(base.length);
            if (!clean.startsWith(base) || !rest)
                return;
            if (/^(ajax|feed|comments?|embed|amp|page)(\/|$)/i.test(rest))
                return;
            if (name && NAV_CHAPTER_RE.test(name))
                name = undefined;
            if (!names.has(clean)) {
                names.set(clean, name || prettyChapterName(rest));
                order.push(clean);
            }
            else if (name && /^(MTL )?Chapter/i.test(names.get(clean) || "")) {
                names.set(clean, name);
            }
        };
        known.forEach(function (chapter) { return add(chapter.path, chapter.name); });
        if (/^\s*[\[{]/.test(html)) {
            try {
                jsonChaptersOf(JSON.parse(html), base, slug).forEach(function (item) {
                    return add(item.path, item.name);
                });
            }
            catch (error) {
                // bukan JSON utuh, lanjut ke regex di bawah
            }
        }
        var $ = (0, cheerio_1.load)(html);
        $("a[href]").each(function (_, element) {
            var link = $(element);
            var path = getChapterPath(link.attr("href") || "");
            if (path)
                add(path, link.text().replace(/\s+/g, " ").trim());
        });
        var escaped = slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        var re = new RegExp("novel(?:\\\\?/)" +
            escaped +
            "((?:(?:\\\\?/)[A-Za-z0-9_\\-]+)+)", "g");
        var match;
        while ((match = re.exec(html))) {
            add("".concat(base).concat(match[1].replace(/\\?\//g, "/").replace(/^\/+/, "")));
        }
        var items = order.map(function (path) { return ({
            path: path,
            name: names.get(path),
            num: chapterNumberOf(path.slice(base.length)),
        }); });
        var numbered = items.filter(function (item) { return item.num !== undefined; }).length;
        if (items.length && numbered / items.length >= 0.8) {
            items.sort(function (a, b) {
                return a.num - b.num ||
                    a.path.localeCompare(b.path);
            });
        }
        return items.map(function (item, index) { return ({
            name: item.name,
            path: item.path,
            chapterNumber: index + 1,
        }); });
    };
    MeioNovelCustomPlugin.prototype.getText = function (url, extra) {
        return __awaiter(this, void 0, Promise, function () {
            var response, _a, error_4;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _b.trys.push([0, 5, , 6]);
                        return [4 /*yield*/, (0, fetch_1.fetchApi)(url, {
                                headers: __assign(__assign({}, REQUEST_HEADERS), (extra || {})),
                            })];
                    case 1:
                        response = _b.sent();
                        if (!response.ok) return [3 /*break*/, 3];
                        return [4 /*yield*/, response.text()];
                    case 2:
                        _a = _b.sent();
                        return [3 /*break*/, 4];
                    case 3:
                        _a = "";
                        _b.label = 4;
                    case 4: return [2 /*return*/, _a];
                    case 5:
                        error_4 = _b.sent();
                        return [2 /*return*/, ""];
                    case 6: return [2 /*return*/];
                }
            });
        });
    };
    MeioNovelCustomPlugin.prototype.endpointCandidates = function (rawHtml) {
        var $ = (0, cheerio_1.load)(rawHtml);
        var found = [];
        var asset = /\.(css|js|mjs|png|jpe?g|gif|svg|webp|avif|ico|woff2?|ttf|otf|map|mp3|mp4)(\?|$)/i;
        var bad = /logout|delete|destroy|bookmark|favorit|like|vote|report|comment|login|register|password|csrf|search|epub|pdf|download|theme|locale|language|subscribe|rating|notification|history|progress|setting|profile|account|storage/i;
        var push = function (value) {
            var v = value.trim();
            if (!/^(https?:\/\/(www\.)?meionovels\.com)?\/[A-Za-z0-9_\-\/.%?=&:]*$/i.test(v)) {
                return;
            }
            if (v === "/" || asset.test(v) || bad.test(v))
                return;
            var abs = absoluteUrl(v);
            if (!found.includes(abs))
                found.push(abs);
        };
        $("*").each(function (_, element) {
            var attribs = element
                .attribs;
            if (!attribs)
                return;
            for (var _i = 0, _a = Object.keys(attribs); _i < _a.length; _i++) {
                var name = _a[_i];
                if (!/^(data-|x-|hx-|@|:|action$|formaction$)/i.test(name))
                    continue;
                var value = String(attribs[name]);
                push(value);
                var re = /['"](\/[A-Za-z0-9_\-\/.%?=&:]+)['"]/g;
                var match = void 0;
                while ((match = re.exec(value)))
                    push(match[1]);
            }
        });
        return found.slice(0, 16);
    };
    MeioNovelCustomPlugin.prototype.chaptersFromEndpoints = function (rawHtmls, cleanPath, referer, known) {
        return __awaiter(this, void 0, Promise, function () {
            var urls, _i, _a, url, text, found, json, next, i, pageText, pageJson;
            var _this = this;
            var _b, _c, _d, _e, _f, _g;
            return __generator(this, function (_h) {
                switch (_h.label) {
                    case 0:
                        urls = [];
                        rawHtmls.forEach(function (html) {
                            return _this.endpointCandidates(html).forEach(function (url) {
                                if (!urls.includes(url))
                                    urls.push(url);
                            });
                        });
                        _i = 0, _a = urls.slice(0, 14);
                        _h.label = 1;
                    case 1:
                        if (!(_i < _a.length)) return [3 /*break*/, 8];
                        url = _a[_i];
                        return [4 /*yield*/, this.getText(url, apiHeaders(referer))];
                    case 2:
                        text = _h.sent();
                        if (!text || !/^\s*[\[{]/.test(text))
                            return [3 /*break*/, 7];
                        found = this.discoverChapters(text, cleanPath, known);
                        if (found.length < 3)
                            return [3 /*break*/, 7];
                        json = void 0;
                        try {
                            json = JSON.parse(text);
                        }
                        catch (error) {
                            json = undefined;
                        }
                        next = (json === null || json === void 0 ? void 0 : json.next_page_url) ||
                            ((_b = json === null || json === void 0 ? void 0 : json.links) === null || _b === void 0 ? void 0 : _b.next) ||
                            ((_c = json === null || json === void 0 ? void 0 : json.meta) === null || _c === void 0 ? void 0 : _c.next) ||
                            ((_d = json === null || json === void 0 ? void 0 : json.pagination) === null || _d === void 0 ? void 0 : _d.next_page_url);
                        i = 0;
                        _h.label = 3;
                    case 3:
                        if (!(typeof next === "string" && next && i < 400)) return [3 /*break*/, 6];
                        return [4 /*yield*/, this.getText(absoluteUrl(next), apiHeaders(referer))];
                    case 4:
                        pageText = _h.sent();
                        if (!pageText)
                            return [3 /*break*/, 6];
                        found = this.discoverChapters(pageText, cleanPath, found);
                        try {
                            pageJson = JSON.parse(pageText);
                            next =
                                (pageJson === null || pageJson === void 0 ? void 0 : pageJson.next_page_url) ||
                                    ((_e = pageJson === null || pageJson === void 0 ? void 0 : pageJson.links) === null || _e === void 0 ? void 0 : _e.next) ||
                                    ((_f = pageJson === null || pageJson === void 0 ? void 0 : pageJson.meta) === null || _f === void 0 ? void 0 : _f.next) ||
                                    ((_g = pageJson === null || pageJson === void 0 ? void 0 : pageJson.pagination) === null || _g === void 0 ? void 0 : _g.next_page_url);
                        }
                        catch (error) {
                            return [3 /*break*/, 6];
                        }
                        _h.label = 5;
                    case 5:
                        i++;
                        return [3 /*break*/, 3];
                    case 6: return [2 /*return*/, found];
                    case 7:
                        _i++;
                        return [3 /*break*/, 1];
                    case 8: return [2 /*return*/, known];
                }
            });
        });
    };
    MeioNovelCustomPlugin.prototype.contentFromEndpoints = function (rawHtml, pageUrl) {
        return __awaiter(this, void 0, Promise, function () {
            var log, _i, _a, url, label, text, json, content;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        log = [];
                        _i = 0, _a = this.endpointCandidates(rawHtml).slice(0, 12);
                        _b.label = 1;
                    case 1:
                        if (!(_i < _a.length)) return [3 /*break*/, 4];
                        url = _a[_i];
                        label = url.replace(SITE, "/").slice(0, 60);
                        return [4 /*yield*/, this.getText(url, apiHeaders(pageUrl))];
                    case 2:
                        text = _b.sent();
                        if (!text) {
                            log.push("".concat(label, ":empty"));
                            return [3 /*break*/, 3];
                        }
                        json = void 0;
                        try {
                            json = JSON.parse(text);
                        }
                        catch (error) {
                            log.push("".concat(label, ":html").concat(text.length));
                            return [3 /*break*/, 3];
                        }
                        content = contentFromJson(json);
                        log.push("".concat(label, ":json").concat(content.length));
                        if (content.length >= 600 && !PLACEHOLDER_RE.test(content)) {
                            return [2 /*return*/, { html: contentToHtml(content), log: log }];
                        }
                        _b.label = 3;
                    case 3:
                        _i++;
                        return [3 /*break*/, 1];
                    case 4: return [2 /*return*/, { log: log }];
                }
            });
        });
    };
    MeioNovelCustomPlugin.prototype.postJson = function (url, body, csrf, referer) {
        return __awaiter(this, void 0, Promise, function () {
            var response, data, _a, _b, error_5, error_6;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        _c.trys.push([0, 6, , 7]);
                        return [4 /*yield*/, (0, fetch_1.fetchApi)(url, {
                                method: "POST",
                                headers: {
                                    "Content-Type": "application/json",
                                    Accept: "application/json",
                                    "X-CSRF-TOKEN": csrf,
                                    "X-Requested-With": "XMLHttpRequest",
                                    Referer: referer,
                                    Origin: SITE.replace(/\/+$/, ""),
                                },
                                body: JSON.stringify(body),
                            })];
                    case 1:
                        response = _c.sent();
                        data = {};
                        _c.label = 2;
                    case 2:
                        _c.trys.push([2, 4, , 5]);
                        _b = (_a = JSON).parse;
                        return [4 /*yield*/, response.text()];
                    case 3:
                        data = _b.apply(_a, [_c.sent()]);
                        return [3 /*break*/, 5];
                    case 4:
                        error_5 = _c.sent();
                        data = {};
                        return [3 /*break*/, 5];
                    case 5: return [2 /*return*/, { ok: response.ok, status: response.status, data: data }];
                    case 6:
                        error_6 = _c.sent();
                        return [2 /*return*/, { ok: false, status: 0, data: {} }];
                    case 7: return [2 /*return*/];
                }
            });
        });
    };
    // Isi chapter: POST contentUrl {chapter, token} -> {k, p} -> XOR -> HTML
    MeioNovelCustomPlugin.prototype.contentViaApi = function (rawHtml, pageUrl) {
        return __awaiter(this, void 0, Promise, function () {
            var html, attempt, $, xdata, cfg, csrf, res, decoded;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        html = rawHtml;
                        attempt = 0;
                        _b.label = 1;
                    case 1:
                        if (!(attempt < 2)) return [3 /*break*/, 6];
                        $ = (0, cheerio_1.load)(html);
                        xdata = $('[x-data*="reader"]').first().attr("x-data") || "";
                        cfg = readConfig(xdata, ["contentUrl", "contentToken", "chapterId"]);
                        if (!cfg.contentUrl || !cfg.contentToken) {
                            cfg = readConfig(html, ["contentUrl", "contentToken", "chapterId"]);
                        }
                        if (!cfg.contentUrl || !cfg.contentToken) {
                            return [2 /*return*/, {
                                    log: "cfg-missing url=".concat(!!cfg.contentUrl, " token=").concat(!!cfg.contentToken, " xdata=").concat(xdata.slice(0, 160)),
                                }];
                        }
                        csrf = $('meta[name="csrf-token"]').attr("content") || "";
                        return [4 /*yield*/, this.postJson(absoluteUrl(cfg.contentUrl), { chapter: asIdValue(cfg.chapterId), token: cfg.contentToken }, csrf, pageUrl)];
                    case 2:
                        res = _b.sent();
                        if (res.ok && res.data && res.data.k && Array.isArray(res.data.p)) {
                            decoded = decodePayload(res.data);
                            if (decoded.replace(/<[^>]+>/g, "").trim().length > 0) {
                                return [2 /*return*/, { html: decoded, log: "ok" }];
                            }
                            return [2 /*return*/, { log: "decoded-empty" }];
                        }
                        if (!(res.status === 419 && attempt === 0)) return [3 /*break*/, 4];
                        return [4 /*yield*/, this.getHtml(pageUrl)];
                    case 3:
                        html = (_b.sent()).html; // segarkan sesi + token lalu coba lagi
                        return [3 /*break*/, 5];
                    case 4: return [2 /*return*/, {
                            log: "post ".concat(res.status, " keys=").concat(Object.keys(res.data || {}).join(","), " msg=").concat(String(((_a = res.data) === null || _a === void 0 ? void 0 : _a.pesan) || "").slice(0, 80)),
                        }];
                    case 5:
                        attempt++;
                        return [3 /*break*/, 1];
                    case 6: return [2 /*return*/, { log: "retry-exhausted" }];
                }
            });
        });
    };
    // Daftar chapter: POST {novel, token, params} -> {html} (berpaginasi lewat params.page)
    MeioNovelCustomPlugin.prototype.chaptersViaApi = function (pageHtml, cleanPath, novelUrl) {
        return __awaiter(this, void 0, Promise, function () {
            var attempt, chapters, fresh, firstPath, chapterUrl, chapterPage;
            var _this = this;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        attempt = function (html, referer) { return __awaiter(_this, void 0, Promise, function () {
                            var $, csrf, url, makeBody, listX, list, readerX, first, found, pageNumbers, maxPage, limit, page, res, merged;
                            var _a, _b;
                            return __generator(this, function (_c) {
                                switch (_c.label) {
                                    case 0:
                                        $ = (0, cheerio_1.load)(html);
                                        csrf = $('meta[name="csrf-token"]').attr("content") || "";
                                        url = "";
                                        makeBody = function () { return ({}); };
                                        listX = $('[x-data*="chapterList"]').first().attr("x-data") || "";
                                        list = readConfig(listX || html, ["url", "novel", "token"]);
                                        if (list.url && list.token && list.novel) {
                                            url = absoluteUrl(list.url);
                                            makeBody = function (params) { return ({
                                                novel: asIdValue(list.novel),
                                                token: list.token,
                                                params: params,
                                            }); };
                                        }
                                        else {
                                            readerX = $('[x-data*="reader"]').first().attr("x-data") || "";
                                            list = readConfig(readerX || html, [
                                                "listUrl",
                                                "listToken",
                                                "novelId",
                                                "chapterId",
                                            ]);
                                            if (!list.listUrl || !list.listToken)
                                                return [2 /*return*/, []];
                                            url = absoluteUrl(list.listUrl);
                                            makeBody = function () { return ({
                                                novel: asIdValue(list.novelId),
                                                chapter: asIdValue(list.chapterId),
                                                token: list.listToken,
                                            }); };
                                        }
                                        return [4 /*yield*/, this.postJson(url, makeBody({}), csrf, referer)];
                                    case 1:
                                        first = _c.sent();
                                        if (first.status === 419)
                                            return [2 /*return*/, []];
                                        if (!first.ok || typeof ((_a = first.data) === null || _a === void 0 ? void 0 : _a.html) !== "string")
                                            return [2 /*return*/, []];
                                        found = this.discoverChapters(first.data.html, cleanPath, []);
                                        pageNumbers = (first.data.html.match(/[?&]page=(\d+)/g) || []).map(function (m) { return Number(m.replace(/\D/g, "")); });
                                        maxPage = Math.max.apply(null, [1].concat(pageNumbers));
                                        ["last_page", "total_pages", "pages", "page_count", "max_page"].forEach(function (key) {
                                            var value = Number(first.data[key]);
                                            if (value > maxPage)
                                                maxPage = value;
                                        });
                                        limit = maxPage > 1 ? maxPage : 2;
                                        page = 2;
                                        _c.label = 2;
                                    case 2:
                                        if (!(page <= Math.min(limit, 600))) return [3 /*break*/, 5];
                                        return [4 /*yield*/, this.postJson(url, makeBody({ page: String(page) }), csrf, referer)];
                                    case 3:
                                        res = _c.sent();
                                        if (!res.ok || typeof ((_b = res.data) === null || _b === void 0 ? void 0 : _b.html) !== "string")
                                            return [3 /*break*/, 5];
                                        merged = this.discoverChapters(res.data.html, cleanPath, found);
                                        if (merged.length <= found.length)
                                            return [3 /*break*/, 5]; // tidak ada chapter baru
                                        found = merged;
                                        if (maxPage <= 1)
                                            limit = page + 1; // jumlah halaman tidak diketahui
                                        _c.label = 4;
                                    case 4:
                                        page++;
                                        return [3 /*break*/, 2];
                                    case 5: return [2 /*return*/, found];
                                }
                            });
                        }); };
                        return [4 /*yield*/, attempt(pageHtml, novelUrl)];
                    case 1:
                        chapters = _b.sent();
                        if (!!chapters.length) return [3 /*break*/, 4];
                        return [4 /*yield*/, this.getHtml(novelUrl)];
                    case 2:
                        fresh = _b.sent();
                        return [4 /*yield*/, attempt(fresh.html, novelUrl)];
                    case 3:
                        chapters = _b.sent();
                        _b.label = 4;
                    case 4:
                        if (!!chapters.length) return [3 /*break*/, 7];
                        firstPath = (_a = this.discoverChapters(pageHtml, cleanPath, [])[0]) === null || _a === void 0 ? void 0 : _a.path;
                        if (!firstPath) return [3 /*break*/, 7];
                        chapterUrl = "".concat(SITE).concat(firstPath, "/");
                        return [4 /*yield*/, this.getHtml(chapterUrl)];
                    case 5:
                        chapterPage = _b.sent();
                        return [4 /*yield*/, attempt(chapterPage.html, chapterUrl)];
                    case 6:
                        chapters = _b.sent();
                        _b.label = 7;
                    case 7: return [2 /*return*/, chapters];
                }
            });
        });
    };
    MeioNovelCustomPlugin.prototype.findPostId = function ($) {
        var _a, _b;
        var bodyClass = $("body").attr("class") || "";
        return ($(".rating-post-id").attr("value") ||
            $("#manga-chapters-holder").attr("data-id") ||
            $("[data-post]").first().attr("data-post") ||
            ((_a = bodyClass.match(/(?:^|\s)postid-(\d+)/)) === null || _a === void 0 ? void 0 : _a[1]) ||
            ((_b = ($('link[rel="shortlink"]').attr("href") || "").match(/[?&]p=(\d+)/)) === null || _b === void 0 ? void 0 : _b[1]) ||
            ($("article[id^='post-']").first().attr("id") || "").replace("post-", "") ||
            "");
    };
    MeioNovelCustomPlugin.prototype.probe = function (url, body, referer) {
        return __awaiter(this, void 0, void 0, function () {
            var response, text, error_7;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 3, , 4]);
                        return [4 /*yield*/, (0, fetch_1.fetchApi)(url, {
                                method: "POST",
                                headers: __assign(__assign({}, REQUEST_HEADERS), { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", "X-Requested-With": "XMLHttpRequest", Referer: referer }),
                                body: body,
                            })];
                    case 1:
                        response = _a.sent();
                        return [4 /*yield*/, response.text()];
                    case 2:
                        text = _a.sent();
                        return [2 /*return*/, "".concat(response.status, "/").concat(text.length, "/").concat(text
                                .replace(/\s+/g, " ")
                                .slice(0, 140))];
                    case 3:
                        error_7 = _a.sent();
                        return [2 /*return*/, "ERR ".concat(String(error_7).slice(0, 80))];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    MeioNovelCustomPlugin.prototype.parseNovel = function (novelPath) {
        return __awaiter(this, void 0, Promise, function () {
            var cleanPath, novelUrl, page, chapterHtml, $, name, novelId, chapters, oldHtml, getAjax, fromGet, discovered, firstPath, firstHtml, _a, viaApi, detail, statusText, cover, metaDescription, readText, synopsisEl, summary, _i, _b, candidate, text, finalSummary;
            var _c;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        cleanPath = normalizePath(novelPath);
                        novelUrl = "".concat(SITE).concat(cleanPath, "/");
                        return [4 /*yield*/, this.getHtml(novelUrl)];
                    case 1:
                        page = _d.sent();
                        chapterHtml = "";
                        $ = page.$;
                        $(".manga-title-badges, #manga-title span").remove();
                        name = $(".post-title h1").first().text().trim() ||
                            $("#manga-title h1").first().text().trim() ||
                            $(".manga-title").first().text().trim() ||
                            $("h1.entry-title").first().text().trim() ||
                            $("h1").first().text().trim() ||
                            ($('meta[property="og:title"]').attr("content") || "").trim();
                        if (!name) {
                            throw new Error("MeioNovel novel page had no title: ".concat(novelUrl));
                        }
                        novelId = this.findPostId($);
                        return [4 /*yield*/, this.chaptersViaApi(page.html, cleanPath, novelUrl)];
                    case 2:
                        chapters = _d.sent();
                        if (!chapters.length) {
                            chapters = chapterHtml ? this.parseChapters(chapterHtml, cleanPath) : [];
                        }
                        if (!(!chapters.length && novelId)) return [3 /*break*/, 4];
                        return [4 /*yield*/, this.postForm("".concat(SITE, "wp-admin/admin-ajax.php"), "action=manga_get_chapters&manga=".concat(encodeURIComponent(novelId)), novelUrl)];
                    case 3:
                        oldHtml = _d.sent();
                        if (oldHtml && oldHtml !== "0") {
                            chapters = this.parseChapters(oldHtml, cleanPath);
                        }
                        _d.label = 4;
                    case 4:
                        if (!chapters.length) {
                            chapters = this.parseChapters(page.html, cleanPath);
                        }
                        if (!(chapters.length <= 1)) return [3 /*break*/, 6];
                        return [4 /*yield*/, this.getText("".concat(novelUrl, "ajax/chapters/"))];
                    case 5:
                        getAjax = _d.sent();
                        fromGet = getAjax ? this.parseChapters(getAjax, cleanPath) : [];
                        discovered = this.discoverChapters("".concat(page.html, "\n").concat(getAjax), cleanPath, fromGet.length > chapters.length ? fromGet : chapters);
                        if (discovered.length > chapters.length)
                            chapters = discovered;
                        _d.label = 6;
                    case 6:
                        if (!(chapters.length < 5)) return [3 /*break*/, 11];
                        firstPath = (_c = chapters[0]) === null || _c === void 0 ? void 0 : _c.path;
                        if (!firstPath) return [3 /*break*/, 8];
                        return [4 /*yield*/, this.getText("".concat(SITE).concat(firstPath, "/"))];
                    case 7:
                        _a = _d.sent();
                        return [3 /*break*/, 9];
                    case 8:
                        _a = "";
                        _d.label = 9;
                    case 9:
                        firstHtml = _a;
                        return [4 /*yield*/, this.chaptersFromEndpoints([page.html, firstHtml], cleanPath, novelUrl, chapters)];
                    case 10:
                        viaApi = _d.sent();
                        if (viaApi.length > chapters.length)
                            chapters = viaApi;
                        _d.label = 11;
                    case 11:
                        detail = function (pattern) {
                            return $(".post-content_item")
                                .filter(function (_, element) { return pattern.test($(element).find("h5").text()); })
                                .find(".summary-content, .summary_content");
                        };
                        statusText = detail(/status/i).text().trim();
                        cover = getCover($(".summary_image").first()) ||
                            ($('meta[property="og:image"]').attr("content") &&
                                isUsableUrl($('meta[property="og:image"]').attr("content"))
                                ? absoluteUrl($('meta[property="og:image"]').attr("content"))
                                : undefined);
                        metaDescription = ($('meta[property="og:description"]').attr("content") ||
                            $('meta[name="description"]').attr("content") ||
                            "")
                            .replace(/\s+/g, " ")
                            .trim();
                        readText = function (el) {
                            var paragraphs = el
                                .find("p")
                                .map(function (_, p) { return $(p).text().replace(/\s+/g, " ").trim(); })
                                .get()
                                .filter(Boolean);
                            return (paragraphs.length ? paragraphs.join("\n\n") : el.text())
                                .replace(/[ \t]+/g, " ")
                                .trim();
                        };
                        synopsisEl = $(".summary__content, .synopsis, #synopsis, .sinopsis, [itemprop='description'], .manga-summary, .description-summary")
                            .filter(function (_, el) { return $(el).text().trim().length > 60; })
                            .first();
                        summary = synopsisEl.length ? readText(synopsisEl) : "";
                        if (summary.length < metaDescription.length) {
                            // og:description sering terpotong; cari blok paragraf yang lebih lengkap
                            for (_i = 0, _b = rankContainers($).slice(0, 6); _i < _b.length; _i++) {
                                candidate = _b[_i];
                                text = readText(candidate.el);
                                if (text.length > Math.max(metaDescription.length, summary.length) &&
                                    text.length < 4000 &&
                                    !PLACEHOLDER_RE.test(text)) {
                                    summary = text;
                                    break;
                                }
                            }
                        }
                        if (summary.length < metaDescription.length)
                            summary = metaDescription;
                        finalSummary = summary || undefined;
                        return [2 /*return*/, {
                                path: novelPath,
                                name: name,
                                cover: cover,
                                author: detail(/author/i).text().trim() || undefined,
                                genres: detail(/genre|kategori|tag/i)
                                    .find("a")
                                    .map(function (_, element) { return $(element).text().trim(); })
                                    .get()
                                    .filter(Boolean)
                                    .join(", ") || undefined,
                                status: /ongoing|on-going|berjalan/i.test(statusText)
                                    ? novelStatus_1.NovelStatus.Ongoing
                                    : /completed|complete|end|tamat|selesai/i.test(statusText)
                                        ? novelStatus_1.NovelStatus.Completed
                                        : novelStatus_1.NovelStatus.Unknown,
                                summary: finalSummary,
                                chapters: chapters,
                            }];
                }
            });
        });
    };
    MeioNovelCustomPlugin.prototype.extractEmbedded = function (rawHtml) {
        var scripts = rawHtml.match(/<script\b[^>]*>[\s\S]*?<\/script>/gi) || [];
        var best = "";
        for (var _i = 0, scripts_1 = scripts; _i < scripts_1.length; _i++) {
            var script = scripts_1[_i];
            var re = /"((?:[^"\\]|\\.){600,})"/g;
            var match = void 0;
            while ((match = re.exec(script))) {
                var value = "";
                try {
                    value = JSON.parse("\"".concat(match[1], "\""));
                }
                catch (error) {
                    continue;
                }
                if (/^(https?:|data:)/i.test(value))
                    continue;
                if (!/\s/.test(value.slice(0, 200)))
                    continue;
                if (PLACEHOLDER_RE.test(value))
                    continue;
                if (value.length > best.length)
                    best = value;
            }
        }
        if (best.length < 600)
            return undefined;
        if (/<p[\s>]/i.test(best))
            return best;
        return best
            .split(/\r?\n\s*\r?\n/)
            .map(function (block) { return block.trim(); })
            .filter(Boolean)
            .map(function (block) { return "<p>".concat(escapeHtml(block).replace(/\r?\n/g, "<br>"), "</p>"); })
            .join("");
    };
    MeioNovelCustomPlugin.prototype.describeDynamic = function (rawHtml, log) {
        return __awaiter(this, void 0, Promise, function () {
            var $, parts, attrs, holder, node, i, metas, skip, srcs, bundle, sameOrigin, _i, sameOrigin_1, src, _a, _b, grep;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        $ = (0, cheerio_1.load)(rawHtml);
                        parts = [];
                        attrs = function (el) {
                            return Object.entries(el.attr() || {})
                                .filter(function (_a) {
                                var key = _a[0];
                                return key !== "style";
                            })
                                .map(function (_a) {
                                var key = _a[0], value = _a[1];
                                return "".concat(key, "=").concat(String(value).slice(0, 70));
                            })
                                .join(";");
                        };
                        holder = $("*")
                            .filter(function (_, el) {
                            return $(el).children().length === 0 && PLACEHOLDER_RE.test($(el).text());
                        })
                            .first();
                        if (holder.length) {
                            node = holder;
                            for (i = 0; i < 3 && node.length; i++) {
                                parts.push("h".concat(i, "=").concat(labelOf($, node.get(0)), "[").concat(attrs(node), "]"));
                                node = node.parent();
                            }
                        }
                        parts.push("body[".concat(attrs($("body")).slice(0, 120), "]"));
                        parts.push("eps=".concat(this.endpointCandidates(rawHtml)
                            .map(function (url) { return url.replace(SITE, "/"); })
                            .slice(0, 12)
                            .join(",")));
                        parts.push("probe=".concat(log.join(" ; ")));
                        parts.push("forms=".concat($("form")
                            .map(function (_, el) { return "".concat($(el).attr("method") || "get", ":").concat($(el).attr("action") || ""); })
                            .get()
                            .slice(0, 5)
                            .join(",")));
                        parts.push("xdata=".concat($("[x-data]")
                            .map(function (_, el) { return ($(el).attr("x-data") || "").replace(/\s+/g, " ").slice(0, 110); })
                            .get()
                            .filter(Boolean)
                            .slice(0, 3)
                            .join(" || ")));
                        metas = $("meta[name], meta[property]")
                            .map(function (_, el) { return $(el).attr("name") || $(el).attr("property") || ""; })
                            .get()
                            .filter(function (name) { return !/viewport|robots|description|theme|generator|^og:|^twitter:/i.test(name); })
                            .slice(0, 8);
                        parts.push("meta=".concat(metas.join(",")));
                        skip = /jquery|cloudflare|google|gstatic|adsbygoogle|wp-includes|gtag/i;
                        srcs = $("script[src]")
                            .map(function (_, el) { return $(el).attr("src") || ""; })
                            .get()
                            .filter(function (src) { return !skip.test(src); });
                        parts.push("js=".concat(srcs
                            .map(function (src) { return src.replace(/^https?:\/\/[^/]+/, "").split("?")[0].slice(-40); })
                            .slice(0, 6)
                            .join(",")));
                        bundle = $("script:not([src])")
                            .map(function (_, el) { return $(el).html() || ""; })
                            .get()
                            .join("\n");
                        sameOrigin = srcs
                            .filter(function (src) { return /^(https?:)?\/\/(www\.)?meionovels\.com|^\//.test(src); })
                            .slice(0, 3);
                        _i = 0, sameOrigin_1 = sameOrigin;
                        _c.label = 1;
                    case 1:
                        if (!(_i < sameOrigin_1.length)) return [3 /*break*/, 4];
                        src = sameOrigin_1[_i];
                        _a = bundle;
                        _b = "\n".concat;
                        return [4 /*yield*/, this.getText(absoluteUrl(src))];
                    case 2:
                        bundle = _a + _b.apply("\n", [_c.sent()]);
                        _c.label = 3;
                    case 3:
                        _i++;
                        return [3 /*break*/, 1];
                    case 4:
                        grep = function (re, count, group) {
                            if (group === void 0) { group = 0; }
                            var out = [];
                            var match;
                            while ((match = re.exec(bundle)) && out.length < count) {
                                var value = (match[group] || match[0]).slice(0, 90);
                                if (!out.includes(value))
                                    out.push(value);
                            }
                            return out.join(",");
                        };
                        parts.push("wpjson=".concat(grep(/wp-json\/[A-Za-z0-9_\-\/.]+/g, 6)));
                        parts.push("api=".concat(grep(/["'`](\/?api\/[A-Za-z0-9_\-\/.{}$]+)/g, 5, 1)));
                        parts.push("action=".concat(grep(/action\s*[:=]\s*["']([A-Za-z0-9_\-]+)["']/g, 6, 1)));
                        parts.push("fetch=".concat(grep(/fetch\(([^)]{0,90})\)?/g, 4, 1)));
                        return [2 /*return*/, parts.join(" | ").slice(0, 2400)];
                }
            });
        });
    };
    MeioNovelCustomPlugin.prototype.parseChapter = function (chapterPath) {
        return __awaiter(this, void 0, Promise, function () {
            var cleanPath, _a, $, rawHtml, finish, usable, _i, _b, selector, body, html, api, _c, _d, selector, content, html, candidates, _e, _f, candidate, html, embedded, viaApi, dynamic;
            return __generator(this, function (_g) {
                switch (_g.label) {
                    case 0:
                        cleanPath = normalizePath(chapterPath);
                        return [4 /*yield*/, this.getHtml("".concat(SITE).concat(cleanPath, "/"))];
                    case 1:
                        _a = _g.sent(), $ = _a.$, rawHtml = _a.html;
                        $("script, style, noscript, iframe, .ads, .ad, .adsbygoogle, .chapter-nav, .nav-links, .wp-manga-nav, nav, header, footer, form, .comments, #comments").remove();
                        finish = function (content) {
                            var _a;
                            content.find("p").each(function (_, element) {
                                var paragraph = $(element);
                                if (!paragraph.find("br").length)
                                    return;
                                var lines = (paragraph.html() || "")
                                    .split(/<br\s*\/?>/i)
                                    .map(function (line) { return line.replace(/\uFEFF/g, "").trim(); })
                                    .filter(function (line) { return line.replace(/&nbsp;|\u00a0/g, "").trim(); });
                                paragraph.replaceWith(lines.map(function (line) { return "<p>".concat(line, "</p>"); }).join(""));
                            });
                            return (_a = content.html()) === null || _a === void 0 ? void 0 : _a.trim();
                        };
                        usable = function (content, min) {
                            var text = content.text().replace(/\s+/g, " ").trim();
                            return text.length >= min && !PLACEHOLDER_RE.test(text);
                        };
                        // 0) isi sudah ada di HTML (tanpa token) atau diambil lewat API situs
                        for (_i = 0, _b = ['[x-ref="body"]', ".reader-body"]; _i < _b.length; _i++) {
                            selector = _b[_i];
                            body = $(selector).first();
                            if (usable(body, 200)) {
                                html = finish(body);
                                if (html)
                                    return [2 /*return*/, html];
                            }
                        }
                        return [4 /*yield*/, this.contentViaApi(rawHtml, "".concat(SITE).concat(cleanPath, "/"))];
                    case 2:
                        api = _g.sent();
                        if (api.html)
                            return [2 /*return*/, api.html];
                        // 1) selector yang umum dipakai tema novel
                        for (_c = 0, _d = [
                            ".reading-content",
                            "#chapter-content",
                            ".chapter-content",
                            ".chapter-body",
                            "#chr-content",
                            ".entry-content",
                            ".text-left",
                            ".text-right",
                            "article",
                        ]; _c < _d.length; _c++) {
                            selector = _d[_c];
                            content = $(selector).first();
                            if (!usable(content, 200))
                                continue;
                            html = finish(content);
                            if (html)
                                return [2 /*return*/, html];
                        }
                        candidates = rankContainers($);
                        for (_e = 0, _f = candidates.slice(0, 8); _e < _f.length; _e++) {
                            candidate = _f[_e];
                            if (candidate.score < 150)
                                break;
                            if (!usable(candidate.el, 150))
                                continue;
                            html = finish(candidate.el);
                            if (html)
                                return [2 /*return*/, html];
                        }
                        embedded = this.extractEmbedded(rawHtml);
                        if (embedded)
                            return [2 /*return*/, embedded];
                        return [4 /*yield*/, this.contentFromEndpoints(rawHtml, "".concat(SITE).concat(cleanPath, "/"))];
                    case 3:
                        viaApi = _g.sent();
                        if (viaApi.html)
                            return [2 /*return*/, viaApi.html];
                        return [4 /*yield*/, this.describeDynamic(rawHtml, __spreadArray([
                                "api=".concat(api.log)
                            ], viaApi.log, true))];
                    case 4:
                        dynamic = _g.sent();
                        throw new Error("MeioNovel chapter content is loaded by JS: ".concat(cleanPath, " | DYN: ").concat(dynamic));
                }
            });
        });
    };
    return MeioNovelCustomPlugin;
}());
exports.default = new MeioNovelCustomPlugin();
