// Descriptor properties this app adds to every field, with type checking.
// pages/form/schema-to-form.vue writes `help` into the JSON Schema of its form.
declare module "mapomodule/types" {
  interface FieldExtensions {
    /** A sentence that tells whoever fills the field what to write. */
    help?: string;
  }
}

export {};
