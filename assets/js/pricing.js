/* Shared fixed-price catalog: cents, used by the website and Stripe server.
 * USD set once using ECB EUR/USD 1.1298 dated 2026-10-01, via Frankfurter.
 * Each USD unit/shipping price rounds UP to the next .90. No daily FX calls.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MMCPricing = factory();
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';
  const version = '2026-10-01-usd90';
  const catalogs = {
  "EUR": {
    "prices": {
      "S": 3190,
      "M": 4990,
      "L": 6490,
      "FRAMED-S": 7999,
      "FRAMED-M": 10999,
      "FRAMED-L": 14999
    },
    "easel": 5300,
    "extraInk": 300,
    "shipping": {
      "EU": {
        "standard": 1890,
        "express": 3490
      },
      "US": {
        "standard": 2990,
        "express": 3990
      },
      "GB": {
        "standard": 1990,
        "express": 2990
      },
      "CA": {
        "standard": 3590,
        "express": 4590
      },
      "REST": {
        "standard": 4990,
        "express": 7990
      }
    }
  },
  "USD": {
    "prices": {
      "S": 3690,
      "M": 5690,
      "L": 7390,
      "FRAMED-S": 9090,
      "FRAMED-M": 12490,
      "FRAMED-L": 16990
    },
    "easel": 5990,
    "extraInk": 390,
    "shipping": {
      "EU": {
        "standard": 2190,
        "express": 3990
      },
      "US": {
        "standard": 3390,
        "express": 4590
      },
      "GB": {
        "standard": 2290,
        "express": 3390
      },
      "CA": {
        "standard": 4090,
        "express": 5190
      },
      "REST": {
        "standard": 5690,
        "express": 9090
      }
    }
  }
};
  const eu = new Set(['AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE']);
  function zone(country) { return eu.has(country) ? 'EU' : ['US','GB','CA'].includes(country) ? country : 'REST'; }
  function currencyFor(country) { return country === 'US' ? 'USD' : 'EUR'; }
  function total(currency, variant, easel, extraInks) {
    const c = catalogs[currency];
    if (!c || !Object.prototype.hasOwnProperty.call(c.prices, variant)) return null;
    return c.prices[variant] + (easel ? c.easel : 0) + extraInks * c.extraInk;
  }
  return { version, catalogs, zone, currencyFor, total };
});
