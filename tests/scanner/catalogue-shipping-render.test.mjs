// Render the actual DealCard element tree and invoke the actual affiliate
// handler with transport stubbed. No DOM, provider, network or credentials.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import swc from 'next/dist/build/swc/index.js';
import { DEAL_STATE_FIXTURES } from '../../lib/dev/dealStateFixtures.js';
import { slimPoolRow } from '../../lib/dealPoolShape.mjs';
const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, '../..');
const components = new Map();
function component(name) {
  if (!components.has(name)) {
    const stub = () => null;
    stub.WithinWindow = function WithinWindow() { return null; };
    components.set(name, stub);
  }
  return components.get(name);
}
async function load(file, overrides = {}, exportName = 'default') {
  const filename = resolve(root, file);
  const { code } = swc.transformSync(readFileSync(filename, 'utf8'), {
    filename, jsc: { parser: { syntax: 'ecmascript', jsx: true }, target: 'es2022',
      transform: { react: { runtime: 'automatic' } } }, module: { type: 'commonjs' }
  });
  const compiledModule = { exports: {} };
  const localRequire = (name) => {
    if (name in overrides) return overrides[name];
    if (name.startsWith('@/components/') || name === 'next/link') return component(name);
    if (name.startsWith('@/lib/')) return require(resolve(root, name.slice(2) + '.js'));
    return require(name);
  };
  new Function('require', 'module', 'exports', code)(localRequire, compiledModule, compiledModule.exports);
  return compiledModule.exports[exportName];
}
function find(element, type) {
  if (!element || typeof element !== 'object') return null;
  if (element.type === type) return element;
  const children = element.props?.children;
  for (const child of Array.isArray(children) ? children.flat(Infinity) : [children]) {
    const hit = find(child, type);
    if (hit) return hit;
  }
  return null;
}

const SpeciesCard = await load('components/SpeciesCard.js');
const SealedDealCard = await load('components/SealedDealCard.js');
function words(el) {
  if (el == null || typeof el === 'boolean') return '';
  if (typeof el !== 'object') return String(el);
  return (Array.isArray(el) ? el : [el.props?.children]).flat(Infinity).map(words).join(' ');
}
const {runInNewContext} = await import('node:vm');
const source = readFileSync(resolve(root,'lib/deals.js'),'utf8');
const projections = [...source.matchAll(/\{\s*count: 1,\s*cheapestUsd: Number\(d.total_price_usd \?\? d.total_price\),[\s\S]*?listingType: d.listing_type \?\? "FIXED_PRICE",\s*\}/g)].map(m=>m[0]);
assert.equal(projections.length,3);
for (const [index, expression] of projections.entries()) {
  for (const shipping of [undefined, 0, 5]) {
    for (const listing_type of ['FIXED_PRICE','AUCTION']) {
      test('actual catalogue projection '+index+' shipping='+shipping+' '+listing_type, () => {
        const deal = runInNewContext('('+expression+')', {
          d:{total_price:25,total_price_usd:30,currency:'GBP',marketplace:'EBAY_US',shipping,
            discount_pct:0.25,listing_type,watchlist:{}}, savingsClaimTrusted:()=>true,
          dealCtaUrl:()=> 'https://www.ebay.com/itm/123456789012',
        });
        const el = SpeciesCard({card:{name:'Fixture',set:'Fixture',deal}});
        const text = words(el);
        assert.equal(deal.currency,'GBP');
        assert.equal(deal.shipping,shipping ?? null);
        const price = find(el,component('@/components/Price'));
        assert.equal(price.props.native.currency,'GBP');
        if (shipping === undefined) {
          assert.match(text,/Shipping breakdown not recorded/);
          assert.doesNotMatch(text,/below market|under market ref/);
          assert.match(text,/Recorded (price|total)/);
        } else if (shipping === 0) {
          assert.match(text,/Shipping not confirmed/);
          assert.match(text,/before shipping/);
        } else {
          assert.match(text,/Includes recorded shipping/);
        }
      });
    }
  }
}
for (const shipping of [undefined,0,5]) {
  test('sealed card and share text preserve shipping uncertainty: '+shipping, () => {
    const fixture = DEAL_STATE_FIXTURES.find(f=>f.id==='bin_compared').deal;
    const deal = {...fixture,shipping,sealed_watchlist:{name:'Simulated sealed fixture',set:'Fixture'}};
    const el = SealedDealCard({deal});
    const text = words(el);
    const share = find(el,component('@/components/ShareButton'));
    if (shipping === undefined) {
      assert.match(text,/Shipping breakdown not recorded/);
      assert.doesNotMatch(text,/below market|You save/);
      assert.doesNotMatch(share.props.text,/below market/);
    } else if (shipping === 0) {
      assert.match(text,/Shipping not confirmed/);
      assert.match(text,/before shipping/);
      assert.match(share.props.text,/before shipping/);
    } else {
      assert.match(text,/Includes recorded shipping/);
    }
  });
}

// Consistency phase 1 review: the three assertions above only ever
// rendered SpeciesCard/SealedDealCard. CatalogueBrowser's Tile() (the
// compact gallery on /sets/[slug] and /pokemon/[slug]) had no behavioural
// coverage at all - the bug that produced a bare "45% below market" for
// Jungle Pidgeot (missing the "before shipping" qualifier the same deal's
// DealCard correctly shows) would not have been caught by anything in
// this suite. useRegion() is a real hook and cannot run outside an actual
// React render, so it is overridden here the same way other renderers in
// this file override the affiliate/dealCtaUrl seams - nothing about the
// shipping/discount logic under test is stubbed.
const Tile = await load('components/CatalogueBrowser.js', {
  '@/lib/useRegion': { useRegion: () => null, localizeEbaySearchUrl: (href) => href },
}, 'Tile');

function catalogueTileCard({ shipping, discountPct = 0.25, listingType = 'FIXED_PRICE' }) {
  return {
    tcgplayerId: 1, name: 'Fixture', set: 'Fixture', catalogSlug: 'fixture-set-fixture', refPrice: 40,
    deal: {
      discountPct, listingType, marketplace: 'EBAY_US',
      cheapestUsd: 30, cheapestNative: 30, shipping,
      affiliateUrl: 'https://www.ebay.com/itm/123456789012',
    },
  };
}

for (const shipping of [undefined, 0, 5]) {
  for (const listingType of ['FIXED_PRICE', 'AUCTION']) {
    test(`CatalogueBrowser Tile shipping=${shipping} ${listingType}: the savings claim follows the shared shipping contract`, () => {
      const el = Tile({ card: catalogueTileCard({ shipping, listingType }), speciesName: 'Fixture' });
      const text = words(el);
      if (shipping === undefined) {
        // unknown breakdown: lib/offerPresentation says savingClaim "none" -
        // no badge, no "% below market" / "% under ref" text anywhere, for
        // either listing type. This is the state the bug rendered wrong.
        assert.doesNotMatch(text, /%/, 'unknown shipping must show no percentage claim of any kind');
      } else if (shipping === 0) {
        assert.match(text, /before shipping/, 'unconfirmed (0) shipping must carry the qualifier');
        // words() joins adjacent JSX text-node children with its own space,
        // which the real DOM does not insert - tolerate that harness
        // artifact with \s+ rather than asserting exact spacing.
        assert.match(text, listingType === 'AUCTION' ? /under ref\s+before shipping/ : /below market\s+before shipping/);
      } else {
        assert.doesNotMatch(text, /before shipping/, 'confirmed shipping must not claim "before shipping"');
        assert.match(text, listingType === 'AUCTION' ? /under ref/ : /below market/);
      }
      if (listingType === 'AUCTION') {
        // the auction is never relabelled as a fixed-price total, in any
        // shipping state - unaffected by this phase, checked to be sure.
        assert.match(text, /Est\. total/);
      }
    });
  }
}

test('CatalogueBrowser Tile: an already-untrusted comparison (discountPct null) shows no claim regardless of shipping', () => {
  const el = Tile({ card: catalogueTileCard({ shipping: 5, discountPct: null }), speciesName: 'Fixture' });
  assert.doesNotMatch(words(el), /%/, 'a null discountPct (the projection\'s untrusted-comparison signal) must never surface a percentage claim');
});

// lib/searchEngine.js's providerCatalog() catalogue-reference projection
// (the /search grid's SearchClient ResultTile source). Same technique as
// the lib/deals.js projection check above: extract the actual object
// literal by its stable field names and evaluate it with a fixture `deal`
// and a controllable savingsClaimTrusted, rather than re-implementing the
// logic or mocking Supabase to exercise the real function.
const searchEngineSource = readFileSync(resolve(root, 'lib/searchEngine.js'), 'utf8');
const searchDealProjection = searchEngineSource.match(
  /\{\s*id: deal\.id,[\s\S]*?affiliateUrl: deal\.affiliate_url,\s*\}/
);
assert.ok(searchDealProjection, "lib/searchEngine.js's providerCatalog deal projection literal was not found - source may have moved");
for (const shipping of [undefined, 0, 5]) {
  for (const trusted of [true, false]) {
    test(`searchEngine providerCatalog projection shipping=${shipping} trusted=${trusted}: shipping always passes through, discountPct only when trusted`, () => {
      const result = runInNewContext('(' + searchDealProjection[0] + ')', {
        deal: {
          id: 1, total_price: 25, total_price_usd: 30, shipping, marketplace: 'EBAY_US',
          discount_pct: 0.25, listing_type: 'FIXED_PRICE', affiliate_url: 'https://www.ebay.com/itm/123456789012',
        },
        savingsClaimTrusted: () => trusted,
      });
      assert.equal(result.shipping, shipping ?? null, 'shipping must reach the tile unconditionally - this is the field the earlier projection dropped entirely');
      assert.equal(result.discountPct, trusted ? 0.25 : null, 'discountPct must be null for an untrusted comparison, independent of shipping');
    });
  }
}

// app/search/SearchClient.js's ResultTile is an unexported inner function,
// so it cannot be loaded through the harness above without changing the
// component's export surface (out of this phase's bounded scope). This is
// therefore a SOURCE inspection, not a render - it proves the corrected
// expressions are present and wired together, not that the browser paints
// them; the searchEngine projection test above is the runtime half of
// this fix (data in), this is the static half (rendering contract out).
const searchClientSource = readFileSync(resolve(root, 'app/search/SearchClient.js'), 'utf8');
test('SearchClient ResultTile: badge is gated on offerShipping, not a bare discountPct check (source)', () => {
  assert.match(searchClientSource, /import \{ offerShipping \} from "@\/lib\/offerPresentation";/);
  assert.match(searchClientSource, /const dealShipping = c\.deal \? offerShipping\(c\.deal\) : null;/);
  assert.match(searchClientSource, /const showSavings = c\.deal\?\.discountPct != null && dealShipping\?\.savingClaim !== "none";/);
  assert.match(searchClientSource, /\{showSavings && \(/);
  assert.match(searchClientSource, /\{dealShipping\.savingQualifier\}/);
  // the old unconditional form must be gone, not merely shadowed
  assert.doesNotMatch(searchClientSource, /\{c\.deal && \(/, 'the badge must no longer render on bare c.deal truthiness');
});

// DealCard's CTA wording (bullet 3 of this phase). deal-first-r1.test.mjs
// (R1-3) and homepage-browse-conversion-uxcvr2.test.mjs (UX-CVR-2-2) both
// assert this as a source regex; this is the one behavioural check that
// actually renders DealCard and reads the button text for a trusted deal,
// a plain (untrusted-comparison) listing, and an auction, so the CTA
// switch is proven at runtime and not only in the source string.
const DealCard = await load('components/DealCard.js');
const dealCardFixtures = Object.fromEntries(DEAL_STATE_FIXTURES.map((f) => [f.id, f]));
test('DealCard CTA: trusted deal says "View deal on eBay"', () => {
  const el = DealCard({ deal: dealCardFixtures.bin_compared.deal, pageName: 'test' });
  assert.match(words(el), /View deal on eBay/);
  assert.doesNotMatch(words(el), /View listing on eBay/);
});
test('DealCard CTA: a plain (untrusted-comparison) listing says "View listing on eBay", never "deal"', () => {
  const el = DealCard({ deal: dealCardFixtures.bin_plain.deal, pageName: 'test' });
  assert.match(words(el), /View listing on eBay/);
  assert.doesNotMatch(words(el), /View deal on eBay/);
});
test('DealCard CTA: an auction always says "View auction on eBay", independent of the savings state', () => {
  const el = DealCard({ deal: dealCardFixtures.auction.deal, pageName: 'test' });
  assert.match(words(el), /View auction on eBay/);
  assert.doesNotMatch(words(el), /View deal on eBay|View listing on eBay/);
});
