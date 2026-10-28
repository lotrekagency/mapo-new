import { computed, toValue } from "vue";
import type { ComputedRef, MaybeRefOrGetter } from "vue";
import type { AnyFieldDescriptor, FieldAnnotation } from "../types/index.js";
import { annotationFor, valuePath } from "../utils/annotations.js";
import { injectMapoForm } from "./useMapoForm.js";

/**
 * The annotation of a field, the one its mark shows: the entry at the path of
 * its value, then, for a translatable field, the entry at its bare key.
 *
 * Call it in a custom field component, which receives its `descriptor` as a
 * prop, to style the field or show the annotation in it. Inside a repeater item
 * it reads the item's annotations; outside a form it is always `undefined`.
 *
 * @param descriptor The field's descriptor, or a getter of it.
 * @returns A computed annotation, `undefined` when the field has none.
 *
 * @example
 * const annotation = useFieldAnnotation(() => props.descriptor);
 */
export function useFieldAnnotation(
  // `any` accepts descriptors typed against any model; only `key` and
  // `translatable` are read.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  descriptor: MaybeRefOrGetter<AnyFieldDescriptor<any>>,
): ComputedRef<FieldAnnotation | undefined> {
  const form = injectMapoForm<Record<string, unknown>>();
  return computed(() => {
    if (!form) return undefined;
    const field = toValue(descriptor);
    const path = valuePath(field, form.currentLang.value);
    return annotationFor(
      form.annotations?.value ?? {},
      field.key as string,
      path,
    );
  });
}
