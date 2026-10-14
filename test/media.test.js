import test from 'node:test';
import assert from 'node:assert/strict';
import { toCandidate, isFreeLicense, describe } from '../src/media.js';

// Shapes copied from real Commons API responses (generator=search, prop=imageinfo|videoinfo).
const image = {
  title: 'File:Kuwait towers.jpg', index: 1,
  imageinfo: [{ size: 406067, width: 1600, height: 1200, mediatype: 'BITMAP', mime: 'image/jpeg',
    url: 'https://upload.wikimedia.org/wikipedia/commons/d/df/Kuwait_towers.jpg?utm_source=commons.wikimedia.org',
    thumburl: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/d/df/Kuwait_towers.jpg/960px-Kuwait_towers.jpg?utm_source=x',
    descriptionurl: 'https://commons.wikimedia.org/wiki/File:Kuwait_towers.jpg',
    extmetadata: { LicenseShortName: { value: 'CC BY-SA 2.5 se' }, Artist: { value: '<a href="u">Mikael Lindmark</a>' }, ImageDescription: { value: 'Kuwait Towers' } } }]
};
const audio = {
  title: 'File:Lion dance percussion.ogg', index: 2,
  imageinfo: [{ mediatype: 'AUDIO', mime: 'application/ogg', url: 'https://upload.wikimedia.org/wikipedia/commons/d/de/Lion_dance_percussion.ogg?utm_source=a',
    descriptionurl: 'https://commons.wikimedia.org/wiki/File:Lion_dance_percussion.ogg', extmetadata: { LicenseShortName: { value: 'Public domain' } } }],
  videoinfo: [{ duration: 31.2, derivatives: [
    { src: 'https://upload.wikimedia.org/wikipedia/commons/d/de/Lion_dance_percussion.ogg?utm_source=a', type: 'audio/ogg; codecs="vorbis"' },
    { src: 'https://upload.wikimedia.org/wikipedia/commons/transcoded/d/de/Lion_dance_percussion.ogg/Lion_dance_percussion.ogg.mp3', type: 'audio/mpeg', transcodekey: 'mp3' }] }]
};
const video = {
  title: 'File:Iran country.ogv', index: 1,
  imageinfo: [{ mediatype: 'VIDEO', mime: 'application/ogg', width: 1920, height: 1080,
    url: 'https://upload.wikimedia.org/wikipedia/commons/f/fa/Iran_country.ogv',
    thumburl: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/f/fa/Iran_country.ogv/960px--Iran_country.ogv.jpg',
    descriptionurl: 'https://commons.wikimedia.org/wiki/File:Iran_country.ogv', extmetadata: { LicenseShortName: { value: 'CC BY 4.0' } } }],
  videoinfo: [{ duration: 21.12, derivatives: [
    { src: 'https://upload.wikimedia.org/wikipedia/commons/f/fa/Iran_country.ogv', type: 'video/ogg; codecs="theora, vorbis"' },
    { src: 'https://upload.wikimedia.org/wikipedia/commons/transcoded/f/fa/Iran_country.ogv/Iran_country.ogv.240p.vp9.webm', type: 'video/webm; codecs="vp9, opus"', transcodekey: '240p.vp9.webm' },
    { src: 'https://upload.wikimedia.org/wikipedia/commons/transcoded/f/fa/Iran_country.ogv/Iran_country.ogv.480p.vp9.webm', type: 'video/webm; codecs="vp9, opus"', transcodekey: '480p.vp9.webm' }] }]
};

// The site's player picks <audio>/<video>/<img> by file extension (game.js mediaHtml).
const playerKind = m => /\.(mp3|wav|ogg|m4a|aac)(\?|$)/i.test(m) ? 'audio' : /\.(mp4|webm|mov)(\?|$)/i.test(m) ? 'video' : 'image';

test('image: 960px thumbnail without tracking query, smaller copy for the model', () => {
  const c = toCandidate(image, 'image');
  assert.equal(c.url, 'https://thumb.wikimedia.org/wikipedia/commons/thumb/d/df/Kuwait_towers.jpg/960px-Kuwait_towers.jpg');
  assert.equal(c.thumb, 'https://thumb.wikimedia.org/wikipedia/commons/thumb/d/df/Kuwait_towers.jpg/500px-Kuwait_towers.jpg');
  assert.equal(c.artist, 'Mikael Lindmark');
  assert.equal(playerKind(c.url), 'image');
  assert.equal(toCandidate(image, 'audio'), null);
});

test('audio: uses the mp3 transcode so it plays on iPhone', () => {
  const c = toCandidate(audio, 'audio');
  assert.equal(c.url, 'https://upload.wikimedia.org/wikipedia/commons/transcoded/d/de/Lion_dance_percussion.ogg/Lion_dance_percussion.ogg.mp3');
  assert.equal(playerKind(c.url), 'audio');
  assert.match(describe(c), /audio clip "File:Lion dance percussion.ogg" \(31s\)/);
});

test('video: 480p webm and a still frame for the model', () => {
  const c = toCandidate(video, 'video');
  assert.equal(c.url, 'https://upload.wikimedia.org/wikipedia/commons/transcoded/f/fa/Iran_country.ogv/Iran_country.ogv.480p.vp9.webm');
  assert.equal(c.thumb, 'https://thumb.wikimedia.org/wikipedia/commons/thumb/f/fa/Iran_country.ogv/500px--Iran_country.ogv.jpg');
  assert.equal(playerKind(c.url), 'video');
});

test('long clips and tiny images are skipped', () => {
  assert.equal(toCandidate({ ...audio, videoinfo: [{ ...audio.videoinfo[0], duration: 600 }] }, 'audio'), null);
  assert.equal(toCandidate({ ...image, imageinfo: [{ ...image.imageinfo[0], width: 120, height: 90 }] }, 'image'), null);
});

test('only free licenses pass', () => {
  for (const l of ['CC BY-SA 4.0', 'CC BY 2.0', 'CC0', 'Public domain', 'PD-USGov', 'GFDL', 'CC BY-SA 2.5 se']) assert.ok(isFreeLicense(l), l);
  for (const l of ['CC BY-NC 2.0', 'CC BY-ND 4.0', 'Fair use', '', undefined, 'All rights reserved']) assert.ok(!isFreeLicense(l), String(l));
});
