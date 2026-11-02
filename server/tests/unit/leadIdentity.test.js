import { describe, expect, it } from '@jest/globals';
import { businessIdentityKeys, googleIdentityKeys, sameBusinessIdentity } from '../../src/modules/crm/leadIdentity.js';

const business = (extra = {}) => ({
  name: 'Lion Fitness', source: 'extension', type: 'business',
  address: { street: '12 Boulevard', city: 'Mohammedia', country: 'MA' }, ...extra,
});

describe('conservative business identity', () => {
  it('matches a place ID against the same ID carried only in a legacy CSV Maps URL', () => {
    expect(sameBusinessIdentity(business({ sourceMetadata: { googlePlaceId: 'ChIJlion' } }),
      business({ source: 'import', notes: 'Google Maps: https://www.google.com/maps/place/Lion/data=!1sChIJlion!8m2!3d33.68!4d-7.38' }))).toBe(true);
  });
  it('unifies decimal CID and hexadecimal Maps identifiers', () => {
    const left = googleIdentityKeys({ sourceMetadata: { googlePlaceId: '0xabc:0x123' } });
    const right = googleIdentityKeys({ googleMapsUrl: 'https://www.google.com/maps?cid=291' });
    expect(left.some((key) => right.includes(key))).toBe(true);
    expect(left.some((key) => googleIdentityKeys({ sourceMetadata: { googlePlaceId: '291' } }).includes(key))).toBe(true);
  });
  it('does not merge distinct authoritative IDs, names in different streets, or shared chain contact data', () => {
    expect(sameBusinessIdentity(business({ sourceMetadata: { googlePlaceId: 'branch-a' } }), business({ sourceMetadata: { googlePlaceId: 'branch-b' } }))).toBe(false);
    expect(sameBusinessIdentity(business(), business({ address: { street: '55 Boulevard', city: 'Mohammedia', country: 'MA' } }))).toBe(false);
    expect(sameBusinessIdentity(business({ address: {}, phone: '0611111111', website: 'https://chain.example' }), business({ address: {}, phone: '0611111111', website: 'https://chain.example' }))).toBe(false);
  });
  it('normalizes exact branch evidence but never uses name + city alone', () => {
    expect(sameBusinessIdentity(business(), business({ name: '  LION   FITNESS ', address: { street: '12 Boulevard', city: 'Mohammédia', country: 'Morocco' } }))).toBe(true);
    expect(businessIdentityKeys(business({ address: { city: 'Mohammedia', country: 'MA' } }))).toEqual([]);
  });
  it('does not treat a Maps camera or a name-only place URL as a unique business', () => {
    expect(businessIdentityKeys(business({ address: {}, googleMapsUrl: 'https://www.google.com/maps/place/Lion+Fitness/@33.68,-7.38,14z' }))).toEqual([]);
    expect(googleIdentityKeys({ googleMapsUrl: 'https://evil.example/maps/place/Lion?query_place_id=ChIJlion' })).toEqual([]);
    expect(businessIdentityKeys(business({ address: {}, googleMapsUrl: 'https://evil.example/maps/data=!3d33.68!4d-7.38' }))).toEqual([]);
    expect(googleIdentityKeys({ sourceMetadata: { googlePlaceId: 'CaseSensitive' } }))
      .not.toEqual(googleIdentityKeys({ sourceMetadata: { googlePlaceId: 'casesensitive' } }));
  });
});
