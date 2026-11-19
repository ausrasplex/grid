import { test } from "node:test";
import assert from "node:assert/strict";
import { SvgError, sanitiseSvg, svgDataUrl, tintSvg } from "../svg.ts";

test("a plain icon comes through, rebuilt", () => {
  const clean = sanitiseSvg('<?xml version="1.0"?><!-- made in Inkscape --><svg width="24" height="24" xmlns="http://www.w3.org/2000/svg"><path d="M2 2h20v20H2z" fill="#f00" stroke-width="2"/></svg>');
  assert.equal(clean, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2 2h20v20H2z" fill="#f00" stroke-width="2"/></svg>');
});

test("scripts, handlers, links, pictures and foreign content are dropped", () => {
  const clean = sanitiseSvg(
    `<svg viewBox="0 0 10 10" onload="alert(1)">
      <script>alert(1)</script>
      <script/>
      <a href="javascript:alert(1)"><circle cx="5" cy="5" r="4"/></a>
      <image href="https://example.com/x.png" width="10" height="10"/>
      <foreignObject><div onclick="x()">hi</div></foreignObject>
      <use href="#a"/>
      <style>@import url(https://evil.example/x.css);</style>
      <rect x="1" y="1" width="8" height="8" onclick="alert(1)" fill="url(https://evil.example/#a)" stroke="javascript:alert(1)"/>
      <set attributeName="onload" to="alert(1)"/>
      <animate attributeName="href" values="javascript:alert(1)"/>
      <sodipodi:namedview id="x"><inkscape:grid/></sodipodi:namedview>
    </svg>`,
  );
  assert.equal(clean, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect x="1" y="1" width="8" height="8"/></svg>');
  assert.doesNotMatch(clean, /script|onload|onclick|href|image|evil|javascript|style/i);
});

test("styles become attributes, only the drawing ones", () => {
  const clean = sanitiseSvg('<svg viewBox="0 0 10 10"><path d="M0 0L10 10" style="stroke:#00f;stroke-width:2;behavior:url(x.htc);fill:url(javascript:alert(1))"/></svg>');
  assert.equal(clean, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0L10 10" stroke="#00f" stroke-width="2"/></svg>');
});

test("references only inside the icon", () => {
  const clean = sanitiseSvg('<svg viewBox="0 0 10 10"><defs><linearGradient id="g"><stop offset="0" stop-color="#fff"/></linearGradient></defs><rect width="10" height="10" fill="url(#g)"/></svg>');
  assert.match(clean, /<linearGradient id="g"><stop offset="0" stop-color="#fff"\/><\/linearGradient>/);
  assert.match(clean, /fill="url\(#g\)"/);
});

test("entities, doctypes and broken files are refused", () => {
  assert.throws(() => sanitiseSvg('<!DOCTYPE svg [<!ENTITY x "y">]><svg viewBox="0 0 1 1"><path d="M0 0"/></svg>'), SvgError);
  assert.throws(() => sanitiseSvg('<svg viewBox="0 0 1 1"><![CDATA[<script>]]></svg>'), SvgError);
  assert.throws(() => sanitiseSvg("<html><body>hi</body></html>"), SvgError);
  assert.throws(() => sanitiseSvg('<svg viewBox="0 0 1 1"><g><path d="M0 0"/></rect></svg>'), SvgError);
  assert.throws(() => sanitiseSvg('<svg><path d="M0 0"/></svg>'), /no size/);
  assert.throws(() => sanitiseSvg('<svg viewBox="0 0 1 1"><title>x</title></svg>'), /nothing in it/);
  assert.throws(() => sanitiseSvg(`<svg viewBox="0 0 1 1">${"<g>".repeat(70_000)}`), /too big/);
});

test("text is kept as text, escaped", () => {
  const clean = sanitiseSvg('<svg viewBox="0 0 10 10"><text x="1" y="5">A &amp; B &lt;script&gt;</text></svg>');
  assert.equal(clean, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><text x="1" y="5">A &amp; B &lt;script&gt;</text></svg>');
});

test("tinting turns every colour into the trade's ink", () => {
  const clean = sanitiseSvg('<svg viewBox="0 0 10 10" fill="none"><path d="M0 0" stroke="#123456"/><circle r="1" fill="red"/><rect width="1" height="1" fill="none"/></svg>');
  const tinted = tintSvg(clean, "#dc2626");
  assert.equal(tinted, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" fill="none"><path d="M0 0" stroke="#dc2626"/><circle r="1" fill="#dc2626"/><rect width="1" height="1" fill="none"/></svg>');
  assert.match(tintSvg(sanitiseSvg('<svg viewBox="0 0 1 1"><path d="M0 0"/></svg>'), "#dc2626"), /^<svg fill="#dc2626" /);
  assert.equal(tintSvg(clean, "red; x"), clean);
  assert.match(svgDataUrl(clean), /^data:image\/svg\+xml;charset=utf-8,%3Csvg/);
});
