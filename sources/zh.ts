import type { AtomstrSource } from '../relay/types.ts';

// Feed URLs and mirror keys were checked against the public active Atomstr catalogue on 2026-10-19.
// These are third-party Atomstr mirror accounts, not publisher-owned Nostr accounts; no remote registration was made.
const chineseSources: readonly AtomstrSource[] = Object.freeze([
  {
    id: 'zh-bbc-chinese',
    name: 'BBC News 中文',
    homepage: 'https://www.bbc.com/zhongwen/trad',
    feeds: [{
      url: 'https://feeds.bbci.co.uk/zhongwen/simp/rss.xml',
      pubkey: '10b859ea48b0203d95ca155b956aecaeed4fa7d1874273d85288be2609e22f74',
    }],
  },
  {
    id: 'zh-voa-chinese',
    name: '美国之音中文网',
    homepage: 'https://www.voachinese.com/',
    feeds: [{
      url: 'https://www.voachinese.com/api/zm_yqebbyi',
      pubkey: 'ddc3cdf3187c24c298057e55f9eecf249ddcfcd98613c4c92240b090d5cb014f',
    }],
  },
  {
    id: 'zh-voa-cantonese',
    name: '美国之音粤语',
    homepage: 'https://www.voacantonese.com/',
    feeds: [
      {url: 'https://www.voacantonese.com/api/zrqtyeuuty', pubkey: '7f15397b229c5dd75498b5b400a46702fb09251960663b908f7ef33ba7ef6e65'},
      {url: 'https://www.voacantonese.com/api/z_rt_erut_', pubkey: '5243d6039e5d1f92f8783a1508191eaff810db5d909089c554e06b37fc40a5bb'},
      {url: 'https://www.voacantonese.com/api/zyrtyequty', pubkey: '6494cc02242875998b1a7d4f442e060075cb08a4afa79874893f36ce5d7c5b43'},
      {url: 'https://www.voacantonese.com/api/zbrtmetut_', pubkey: '9b4ea6d1cea3bbf597a9eee16a0088a93672e18cd983d84dbace57f1a0fb1fd1'},
      {url: 'https://www.voacantonese.com/api/zvrtveoutv', pubkey: 'f40b3aa933bf05f18b15f2b3e25903503b5d2039b19078b6f069ec56355e27a2'},
    ],
  },
  {
    id: 'zh-mingpao',
    name: '明报',
    homepage: 'https://news.mingpao.com/',
    feeds: [{
      url: 'https://news.mingpao.com/rss/ins/s00005.xml',
      pubkey: '6983f2df5ee2497cb3f2d0547cdf7dbd780d0e19120f696d1f5e19c0aef793f9',
    }],
  },
  {
    id: 'zh-china-news-service',
    name: '中国新闻网',
    homepage: 'https://www.chinanews.com.cn/',
    feeds: [{
      url: 'https://www.chinanews.com.cn/rss/world.xml',
      pubkey: '9fee0f04ee2e3aa1dbae66e0d2361bfe5d4d8296926ed6be639aa8c95f8f0ddd',
    }],
  },
  {
    id: 'zh-china-digital-times',
    name: '中国数字时代',
    homepage: 'https://chinadigitaltimes.net/chinese/',
    feeds: [{
      url: 'https://chinadigitaltimes.net/chinese/feed',
      pubkey: '86c02f1b134b3bcd39c68d649286c8e0910e020080fd19fe87809f2ad4c2174e',
    }],
  },
  {
    id: 'zh-rfi',
    name: '法国国际广播电台',
    homepage: 'https://www.rfi.fr/cn/',
    feeds: [{
      url: 'https://www.rfi.fr/cn/rss',
      pubkey: 'abb7971abec2300f0d258aec1dde9a2e857fa115483ad558f8897e45d626a111',
    }],
  },
  {
    id: 'zh-kyodo',
    name: '共同网',
    homepage: 'https://tchina.kyodonews.net/',
    feeds: [{
      url: 'https://tchina.kyodonews.net/rss/news.xml',
      pubkey: '798514f862787d582db9c2e7f28db421154f175ffcc519ad7327f6a8631c4f1d',
    }],
  },
]);

export default chineseSources;
