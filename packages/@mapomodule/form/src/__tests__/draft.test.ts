import { describe, expect, it } from "vitest";
import { reactive } from "vue";
import { modelForDraft } from "../runtime/utils/draft.js";
import type { AnyFieldDescriptor } from "../runtime/types/index.js";

describe("modelForDraft", () => {
  it("leaves out a noDraft field at its key, and keeps the others", () => {
    const fields: AnyFieldDescriptor[] = [
      { key: "title", type: "text" },
      { key: "password", type: "text", noDraft: true },
    ];
    const draft = modelForDraft({ title: "Hello", password: "s3cret" }, fields);
    expect(draft).toEqual({ title: "Hello" });
  });

  it("leaves out a noDraft field under a dotted key, and keeps its siblings", () => {
    const fields: AnyFieldDescriptor[] = [
      { key: "api.name", type: "text" },
      { key: "api.key", type: "text", noDraft: true },
    ];
    const draft = modelForDraft(
      { api: { name: "Maps", key: "k-123" } },
      fields,
    );
    expect(draft).toEqual({ api: { name: "Maps" } });
  });

  it("leaves out a translatable noDraft field in every language and at its key", () => {
    const fields: AnyFieldDescriptor[] = [
      { key: "title", type: "text", translatable: true },
      { key: "token", type: "text", translatable: true, noDraft: true },
    ];
    const draft = modelForDraft(
      {
        token: "root",
        translations: {
          en: { title: "Hello", token: "t-en" },
          it: { title: "Ciao", token: "t-it" },
        },
      },
      fields,
    );
    expect(draft).toEqual({
      translations: { en: { title: "Hello" }, it: { title: "Ciao" } },
    });
  });

  it("leaves out a synced noDraft field in every language", () => {
    const fields: AnyFieldDescriptor[] = [
      { key: "pin", type: "text", synci18n: true, noDraft: true },
    ];
    const draft = modelForDraft(
      { translations: { en: { pin: "1234" }, it: { pin: "1234" } } },
      fields,
    );
    expect(draft).toEqual({ translations: { en: {}, it: {} } });
  });

  it("keeps a value of the same name in the languages for a field that is not translated", () => {
    const fields: AnyFieldDescriptor[] = [
      { key: "code", type: "text", noDraft: true },
    ];
    const draft = modelForDraft(
      { code: "x", translations: { en: { code: "label" } } },
      fields,
    );
    expect(draft).toEqual({ translations: { en: { code: "label" } } });
  });

  it("leaves out a noDraft field in each item of a repeater", () => {
    const fields: AnyFieldDescriptor[] = [
      {
        key: "speakers",
        type: "repeater",
        fields: [
          { key: "name", type: "text" },
          { key: "phone", type: "text", noDraft: true },
        ],
      },
    ];
    const draft = modelForDraft(
      {
        speakers: [
          { name: "Ada", phone: "555" },
          { name: "Grace", phone: "556" },
        ],
      },
      fields,
    );
    expect(draft).toEqual({ speakers: [{ name: "Ada" }, { name: "Grace" }] });
  });

  it("reads each item by its template, and an item without one by the first", () => {
    const fields: AnyFieldDescriptor[] = [
      {
        key: "blocks",
        type: "repeater",
        attrs: {
          templates: {
            login: [
              { key: "user", type: "text" },
              { key: "secret", type: "text", noDraft: true },
            ],
            text: [
              { key: "body", type: "textarea" },
              { key: "secret", type: "text" },
            ],
          },
        },
      },
    ];
    const draft = modelForDraft(
      {
        blocks: [
          { _template: "login", user: "ada", secret: "a" },
          { _template: "text", body: "Hi", secret: "kept" },
          { user: "grace", secret: "b" },
        ],
      },
      fields,
    );
    expect(draft).toEqual({
      blocks: [
        { _template: "login", user: "ada" },
        { _template: "text", body: "Hi", secret: "kept" },
        { user: "grace" },
      ],
    });
  });

  it("reaches repeaters in every language and inside other repeaters", () => {
    const fields: AnyFieldDescriptor[] = [
      {
        key: "sections",
        type: "repeater",
        translatable: true,
        fields: [
          {
            key: "rows",
            type: "repeater",
            fields: [
              { key: "label", type: "text" },
              { key: "otp", type: "text", noDraft: true },
            ],
          },
        ],
      },
    ];
    const draft = modelForDraft(
      {
        translations: {
          en: { sections: [{ rows: [{ label: "A", otp: "1" }] }] },
          it: { sections: [{ rows: [{ label: "B", otp: "2" }] }] },
        },
      },
      fields,
    );
    expect(draft).toEqual({
      translations: {
        en: { sections: [{ rows: [{ label: "A" }] }] },
        it: { sections: [{ rows: [{ label: "B" }] }] },
      },
    });
  });

  it("returns a copy, and leaves the model as it is", () => {
    const fields: AnyFieldDescriptor[] = [
      { key: "password", type: "text", noDraft: true },
    ];
    const model = reactive({ title: "Hello", password: "s3cret" });
    const draft = modelForDraft(model, fields);
    expect(draft).toEqual({ title: "Hello" });
    expect(model).toEqual({ title: "Hello", password: "s3cret" });
  });

  it("goes through no key that leads to a prototype", () => {
    const fields: AnyFieldDescriptor[] = [
      { key: "__proto__.polluted", type: "text", noDraft: true },
      { key: "constructor", type: "text", noDraft: true },
    ];
    const draft = modelForDraft({ title: "Hello" }, fields);
    expect(draft).toEqual({ title: "Hello" });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("keeps only what JSON carries back as it was: no file, date, map or number JSON cannot write", () => {
    const fields: AnyFieldDescriptor[] = [{ key: "title", type: "text" }];
    const draft = modelForDraft(
      {
        title: "Hello",
        subtitle: undefined,
        cover: new Blob(["image"]),
        published_on: new Date("2026-11-10T09:00:00.000Z"),
        ratio: Number.NaN,
        tags: ["open data", new Date(0), null],
        seen: new Map([["a", 1]]),
        seo: { title: "Open data", image: new Blob(["og"]) },
      },
      fields,
    );
    expect(draft).toEqual({
      title: "Hello",
      tags: ["open data", null],
      seo: { title: "Open data" },
    });
  });

  it("keeps a key named __proto__ as data, and ends a value met again inside itself", () => {
    const fields: AnyFieldDescriptor[] = [{ key: "title", type: "text" }];
    const model: Record<string, unknown> = JSON.parse(
      '{"title":"Hello","__proto__":{"polluted":true}}',
    );
    model.self = model;

    const draft = modelForDraft(model, fields) as Record<string, unknown>;

    expect(Object.keys(draft)).toEqual(["title", "__proto__"]);
    expect(Object.getPrototypeOf(draft)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});
