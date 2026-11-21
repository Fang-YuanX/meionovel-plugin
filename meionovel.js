"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var fetch_1 = require("@libs/fetch");
var novelStatus_1 = require("@libs/novelStatus");
var cheerio_1 = require("cheerio");
var SITE = "https://meionovels.com/";
var REQUEST_HEADERS = {
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8"
};
var normalizePath = function (value) {
    try {
        if (/^https?:\/\//i.test(value))
            value = new URL(value).pathname;
    }
    catch (_a) {
        return "";
    }
    return value.split(/[?#]/, 1)[0].replace(/^\/+|\/+$/g, "");
};
var novelPathOf = function (href) {
    var path = normalizePath(href);
    return /^novel\/[^/]+$/i.test(path) ? path + "/" : undefined;
};
var chapterPathOf = function (href) {
    var path = normalizePath(href);
    return /^novel\/[^/]+\/.+/i.test(path) ? path : undefined;
};
var absoluteUrl = function (value) {
    try {
        return new URL(value, SITE).href;
    }
    catch (_a) {
        return undefined;
    }
};
var usableImage = function (value) { return !!(value === null || value === void 0 ? void 0 : value.trim()) && !/^data:|dflazy/i.test(value.trim()); };
var NAV_CHAPTER_RE = /^[►▶▸\s]*(mulai baca|baca terbaru|start reading|read first|read last|first chapter|latest chapter)/i;
var MeioNovelPlugin = /** @class */ (function () {
    function MeioNovelPlugin() {
        var _this = this;
        this.id = "meionovel";
        this.name = "MeioNovel Custom";
        this.icon = "src/id/meionovel/icon.png";
        this.site = SITE;
        this.version = "3.0.8";
        this.imageRequestInit = { headers: { Referer: SITE } };
        this.resolveUrl = function (path) { return /^https?:\/\//i.test(path) ? path : "".concat(SITE).concat(normalizePath(path), "/"); };
        this.fetchText = function (url, init) { return __awaiter(_this, void 0, void 0, function () {
            var response;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, (0, fetch_1.fetchApi)(url, Object.assign(Object.assign({}, init), { headers: Object.assign(Object.assign({}, REQUEST_HEADERS), init === null || init === void 0 ? void 0 : init.headers) }))];
                    case 1:
                        response = _a.sent();
                        if (!response.ok)
                            return [2 /*return*/, ""];
                        return [2 /*return*/, response.text()];
                }
            });
        }); };
    }
    MeioNovelPlugin.prototype.getHtml = function (url) {
        return __awaiter(this, void 0, void 0, function () {
            var response, html, title;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, (0, fetch_1.fetchApi)(url, { headers: REQUEST_HEADERS })];
                    case 1:
                        response = _a.sent();
                        if (!response.ok)
                            throw new Error("MeioNovel request failed (".concat(response.status, "): ").concat(url));
                        return [4 /*yield*/, response.text()];
                    case 2:
                        html = _a.sent();
                        title = html.match(/<title[^>]*>([^<]*)<\/title>/i);
                        title = (title === null || title === void 0 ? void 0 : title[1]) || "";
                        if (/bot verification|captcha|verify you are human|just a moment/i.test(title))
                            throw new Error("MeioNovel blocked the request; open the source in WebView first.");
                        return [2 /*return*/, { html: html, $: (0, cheerio_1.load)(html) }];
                }
            });
        });
    };
    MeioNovelPlugin.prototype.getCover = function (scope) {
        var image = scope.find("img").first();
        var candidates = [image.attr("data-lazy-src"), image.attr("data-src"), image.attr("data-cfsrc"), image.attr("data-lazy-srcset") === null || image.attr("data-lazy-srcset") === void 0 ? void 0 : image.attr("data-lazy-srcset").split(/[ ,]/)[0], image.attr("data-srcset") === null || image.attr("data-srcset") === void 0 ? void 0 : image.attr("data-srcset").split(/[ ,]/)[0], image.attr("srcset") === null || image.attr("srcset") === void 0 ? void 0 : image.attr("srcset").split(/[ ,]/)[0], image.attr("src")];
        var value = candidates.find(usableImage);
        return value ? absoluteUrl(value) : undefined;
    };
    MeioNovelPlugin.prototype.parseNovels = function ($) {
        var _this = this;
        var results = new Map();
        var cards = $(".c-tabs-item__content, .page-item-detail, .novel-item");
        var links = (cards.length ? cards : $("body")).find("a[href]");
        links.each(function (_, element) {
            var link = $(element);
            var path = novelPathOf(link.attr("href") || "");
            if (!path)
                return;
            var card = link.closest(".page-item-detail, .c-tabs-item__content, .novel-item, article");
            var name = card.find(".post-title, h3, h2").first().text().trim() || link.attr("title") && link.attr("title").trim() || link.text().trim() || card.find("img").first().attr("alt") && card.find("img").first().attr("alt").trim() || "";
            if (!name)
                return;
            var item = results.get(path);
            if (item) {
                if (!item.cover)
                    item.cover = _this.getCover(card);
            }
            else {
                results.set(path, { name: name, path: path, cover: _this.getCover(card) });
            }
        });
        return Array.from(results.values());
    };
    MeioNovelPlugin.prototype.parseChapters = function (html, novelPath) {
        var $ = (0, cheerio_1.load)(html);
        var prefix = "".concat(normalizePath(novelPath), "/");
        var chapters = [];
        var seen = new Set();
        var add = function (link, releaseTime) {
            if (releaseTime === void 0) { releaseTime = ""; }
            var path = chapterPathOf(link.attr("href") || "");
            var name = link.text().replace(/\s+/g, " ").trim();
            if (!path || !path.startsWith(prefix) || !name || NAV_CHAPTER_RE.test(name) || seen.has(path))
                return;
            if (/\/(?:ajax|feed|comments?|embed|amp|page)(?:\/|$)/i.test(path.slice(prefix.length)))
                return;
            seen.add(path);
            chapters.push({ name: name, path: path, releaseTime: releaseTime || undefined });
        };
        $(".wp-manga-chapter, .chapter-item").each(function (_, element) {
            var row = $(element);
            add(row.find("a[href]").first(), row.find(".chapter-release-date").text().trim());
        });
        if (!chapters.length)
            $("a[href]").each(function (_, element) { return add($(element)); });
        return chapters.reverse().map(function (chapter, index) { return Object.assign(Object.assign({}, chapter), { chapterNumber: index + 1 }); });
    };
    MeioNovelPlugin.prototype.chapterListHtml = function (endpoint, novelUrl) {
        return __awaiter(this, void 0, void 0, function () {
            var request, html, $, pageLinks, pageNumbers, maxPage, lastHref, queryAt, template, urls, i, pages;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        request = function (method, url) {
                            if (url === void 0) { url = endpoint; }
                            return __awaiter(_this, void 0, void 0, function () {
                                var response, _a;
                                var _b;
                                return __generator(this, function (_c) {
                                    switch (_c.label) {
                                        case 0:
                                            _c.trys.push([0, 2, , 3]);
                                            return [4 /*yield*/, (0, fetch_1.fetchApi)(url, Object.assign(Object.assign({ method: method, headers: Object.assign(Object.assign({}, REQUEST_HEADERS), { Referer: novelUrl }) }, (method === "POST" ? { headers: Object.assign(Object.assign({}, REQUEST_HEADERS), { Referer: novelUrl, "X-Requested-With": "XMLHttpRequest" }) } : {})), (method === "POST" ? { referrer: novelUrl } : {})))];
                                        case 1:
                                            response = _c.sent();
                                            if (!response.ok)
                                                return [2 /*return*/, ""];
                                            return [2 /*return*/, response.text()];
                                        case 2:
                                            _a = _c.sent();
                                            return [2 /*return*/, ""];
                                        case 3: return [2 /*return*/];
                                    }
                                });
                            });
                        };
                        return [4 /*yield*/, request("POST")];
                    case 1:
                        html = _a.sent();
                        if (!!html && html.trim() !== "0") return [3 /*break*/, 3];
                        return [4 /*yield*/, request("GET")];
                    case 2:
                        html = _a.sent();
                        _a.label = 3;
                    case 3:
                        if (!html || html.trim() === "0")
                            return [2 /*return*/, ""];
                        $ = (0, cheerio_1.load)(html);
                        pageLinks = $(".pagination a[data-page]");
                        pageNumbers = pageLinks.map(function (_, el) { return Number.parseInt($(el).attr("data-page") || "", 10); }).get().filter(function (n) { return Number.isFinite(n) && n > 1; });
                        maxPage = Math.min(100, Math.max.apply(Math, [1].concat(pageNumbers)));
                        lastHref = pageLinks.last().attr("href") || "";
                        queryAt = lastHref.indexOf("?");
                        if (maxPage <= 1 || queryAt < 0)
                            return [2 /*return*/, html];
                        template = lastHref.slice(queryAt).replace(/\d+$/, "");
                        urls = Array.from({ length: maxPage - 1 }, function (_, i) { return "".concat(endpoint).concat(template).concat(i + 2); });
                        i = 0;
                        _a.label = 4;
                    case 4:
                        if (!(i < urls.length)) return [3 /*break*/, 7];
                        return [4 /*yield*/, Promise.all(urls.slice(i, i + 6).map(function (url) { return request("POST", url); }))];
                    case 5:
                        pages = _a.sent();
                        html += pages.filter(function (page) { return page && page.trim() !== "0"; }).join("");
                        _a.label = 6;
                    case 6:
                        i += 6;
                        return [3 /*break*/, 4];
                    case 7: return [2 /*return*/, html];
                }
            });
        });
    };
    MeioNovelPlugin.prototype.popularNovels = function (pageNo, options) {
        return __awaiter(this, void 0, void 0, function () {
            var order, html;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        order = options === null || options === void 0 ? void 0 : options.showLatestNovels ? "latest" : "views";
                        return [4 /*yield*/, this.fetchText("".concat(SITE, "novel/page/").concat(pageNo, "/?m_orderby=").concat(order))];
                    case 1:
                        html = _a.sent();
                        return [2 /*return*/, html ? this.parseNovels((0, cheerio_1.load)(html)) : []];
                }
            });
        });
    };
    MeioNovelPlugin.prototype.searchNovels = function (searchTerm, pageNo) {
        return __awaiter(this, void 0, void 0, function () {
            var html;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.fetchText("".concat(SITE, "page/").concat(pageNo, "/?s=").concat(encodeURIComponent(searchTerm), "&post_type=wp-manga"))];
                    case 1:
                        html = _a.sent();
                        return [2 /*return*/, html ? this.parseNovels((0, cheerio_1.load)(html)) : []];
                }
            });
        });
    };
    MeioNovelPlugin.prototype.findPostId = function ($) {
        var bodyClass = $("body").attr("class") || "";
        var shortlink = ($('link[rel="shortlink"]').attr("href") || "").match(/[?&]p=(\d+)/);
        return $(".rating-post-id").attr("value") || $("#manga-chapters-holder").attr("data-id") || $("[data-post]").first().attr("data-post") || (bodyClass.match(/(?:^|\s)postid-(\d+)/) || [])[1] || (shortlink || [])[1] || "";
    };
    MeioNovelPlugin.prototype.parseNovel = function (novelPath) {
        return __awaiter(this, void 0, void 0, function () {
            var cleanPath, novelUrl, _a, page, chapterHtml, $, name, chapters, getHtml, getChapters, postId, form, oldHtml, detail, coverUrl, summary, statusText;
            var _this = this;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        cleanPath = normalizePath(novelPath);
                        novelUrl = "".concat(SITE).concat(cleanPath, "/");
                        return [4 /*yield*/, Promise.all([this.getHtml(novelUrl), this.chapterListHtml("".concat(novelUrl, "ajax/chapters/"), novelUrl)])];
                    case 1:
                        _a = _b.sent(), page = _a[0], chapterHtml = _a[1];
                        $ = page.$;
                        $(".manga-title-badges, #manga-title span").remove();
                        name = $(".post-title h1").first().text().trim() || $("#manga-title h1").first().text().trim() || $(".manga-title").first().text().trim() || $("h1.entry-title").first().text().trim() || $("h1").first().text().trim() || $('meta[property="og:title"]').attr("content") && $('meta[property="og:title"]').attr("content").trim() || "";
                        if (!name)
                            throw new Error("MeioNovel novel page had no title: ".concat(novelUrl));
                        chapters = chapterHtml ? this.parseChapters(chapterHtml, cleanPath) : [];
                        if (!(chapters.length <= 1)) return [3 /*break*/, 3];
                        return [4 /*yield*/, this.fetchText("".concat(novelUrl, "ajax/chapters/"))];
                    case 2:
                        getHtml = _b.sent();
                        getChapters = getHtml ? this.parseChapters(getHtml, cleanPath) : [];
                        if (getChapters.length > chapters.length)
                            chapters = getChapters;
                        _b.label = 3;
                    case 3:
                        if (!(chapters.length === 0)) return [3 /*break*/, 5];
                        postId = this.findPostId($);
                        if (!postId) return [3 /*break*/, 5];
                        form = "action=manga_get_chapters&manga=".concat(encodeURIComponent(postId));
                        return [4 /*yield*/, this.fetchText("".concat(SITE, "wp-admin/admin-ajax.php"), { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", "X-Requested-With": "XMLHttpRequest", Referer: novelUrl }, body: form })];
                    case 4:
                        oldHtml = _b.sent();
                        if (oldHtml && oldHtml.trim() !== "0")
                            chapters = this.parseChapters(oldHtml, cleanPath);
                        _b.label = 5;
                    case 5:
                        if (!chapters.length)
                            chapters = this.parseChapters(page.html, cleanPath);
                        detail = function (pattern) { return $(".post-content_item").filter(function (_, el) { return pattern.test($(el).find("h5").text()); }); };
                        coverUrl = _this.getCover($(".summary_image").first()) || $('meta[property="og:image"]').attr("content");
                        summary = $(".summary__content, .manga-summary, .description-summary").first().text().trim() || $('meta[property="og:description"]').attr("content") && $('meta[property="og:description"]').attr("content").trim() || $('meta[name="description"]').attr("content") && $('meta[name="description"]').attr("content").trim();
                        statusText = detail(/status/i).text().trim();
                        return [2 /*return*/, { path: novelPath, name: name, cover: coverUrl && usableImage(coverUrl) ? absoluteUrl(coverUrl) : undefined, author: detail(/author/i).find(".summary-content, .summary_content").text().trim() || undefined, genres: detail(/genre|kategori|tag/i).find("a").map(function (_, el) { return $(el).text().trim(); }).get().filter(Boolean).join(", ") || undefined, status: /ongoing|on-going|berjalan/i.test(statusText) ? novelStatus_1.NovelStatus.Ongoing : /completed|complete|end|tamat|selesai/i.test(statusText) ? novelStatus_1.NovelStatus.Completed : novelStatus_1.NovelStatus.Unknown, summary: summary, chapters: chapters }];
                }
            });
        });
    };
    MeioNovelPlugin.prototype.parseChapter = function (chapterPath) {
        return __awaiter(this, void 0, void 0, function () {
            var cleanPath, _a, $, rawHtml, selectors, _i, selectors_1, selector, content, text, title;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        cleanPath = normalizePath(chapterPath);
                        return [4 /*yield*/, this.getHtml("".concat(SITE).concat(cleanPath, "/"))];
                    case 1:
                        _a = _b.sent(), $ = _a.$, rawHtml = _a.html;
                        $("script, style, noscript, iframe, .ads, .ad, .adsbygoogle, .chapter-nav, .nav-links, .wp-manga-nav, nav, header, footer, form, .comments, #comments").remove();
                        selectors = [".reading-content", "#chapter-content", ".chapter-content", ".chapter-body", "#chr-content", ".text-left", ".text-right", ".entry-content", ".c-blog-post > div > div:nth-child(2)"];
                        for (_i = 0, selectors_1 = selectors; _i < selectors_1.length; _i++) {
                            selector = selectors_1[_i];
                            content = $(selector).first();
                            text = content.text().replace(/\s+/g, " ").trim();
                            if (!content.length || text.length < 30)
                                continue;
                            content.find("p").each(function (_, p) {
                                var paragraph = $(p);
                                if (!paragraph.find("br").length)
                                    return;
                                var lines = (paragraph.html() || "").split(/<br\s*\/?>/i).map(function (line) { return line.replace(/\uFEFF/g, "").trim(); }).filter(function (line) { return line.replace(/&nbsp;|\u00a0/g, "").trim(); });
                                paragraph.replaceWith(lines.map(function (line) { return "<p>".concat(line, "</p>"); }).join(""));
                            });
                            return [2 /*return*/, content.html() ? content.html().trim() : ""];
                        }
                        title = rawHtml.match(/<title[^>]*>([^<]*)<\/title>/i);
                        title = (title === null || title === void 0 ? void 0 : title[1].replace(/\s+/g, " ").trim().slice(0, 80)) || "";
                        throw new Error("MeioNovel chapter content not found: ".concat(cleanPath, " | title=").concat(title));
                }
            });
        });
    };
    return MeioNovelPlugin;
}());
function __awaiter(thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        var generator = generator.apply(thisArg, _arguments || []);
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step(generator.next());
    });
}
function __generator(thisArg, body) {
    var _ = { label: 0, sent: function () { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function () { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) { case 0: case 1: t = op; break; case 4: _.label++; return { value: op[1], done: false }; case 5: _.label++; y = op[1]; op = [0]; continue; case 7: op = _.ops.pop(); _.trys.pop(); continue; default: if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; } if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; } if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; } if (t && _.label < t[2]) { _.ops.push(op); break; } if (t[2]) _.ops.pop(); _.trys.pop(); continue; }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
}
exports.default = new MeioNovelPlugin();
