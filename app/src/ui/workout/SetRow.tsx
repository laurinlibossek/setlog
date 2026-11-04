// A value of a set, typed in place: weight, reps, distance or time. In the
// running workout the app's keypad types into it (the phone's keyboard stays
// down; a hardware keyboard still works); in the editors it's a plain number
// field. Pending sets show last time's numbers in ghost ink; only the set
// being logged, or the field the keypad types into, draws a field box.
import { memo, useEffect, useRef } from 'react';
import { Platform, TextInput, type TextInputInstance } from 'react-native';
import { fmtDigits } from '@setlog/core';

import { RADIUS, TYPE } from '@/design/tally';
import { useTally } from '@/lib/theme';

/** The "Done" bar above the iPhone number pad (DraftBlocks → KeyboardDoneBar). */
export const KEYBOARD_BAR = 'set-keys';

export type Field = 'w' | 'r' | 'd' | 't';
export const FIELD_W: Record<Field, number> = { w: 92, r: 64, d: 92, t: 92 };

/** Typed text as the set keeps it: times are digits ("130" = 1:30), numbers digits and one separator. */
export const cleanInput = (f: Field, v: string) => (f === 't'
  ? v.replace(/\D/g, '').replace(/^0+/, '').slice(0, 6)
  : v.replace(/[^\d.,]/g, '').slice(0, f === 'r' ? 3 : 7));

type Props = {
  field: Field;
  /** what the set holds (time as digits) */
  value: string;
  /** the ghost value (time as digits) */
  ghost: string;
  /** one field on its own (reps only, a duration) is wider */
  single?: boolean;
  /** draw the field box (the set being logged, or every set in an editor) */
  boxed: boolean;
  /** the keypad types into this field */
  editing?: boolean;
  /** ink for a logged value; pending typed values are ink too */
  label: string;
  testID: string;
  onChange: (v: string) => void;
  /** running workout: the keypad opens instead of the phone's keyboard */
  onKeypad?: () => void;
  /** registers the field so the keypad can focus it and scroll it into view */
  register?: (ref: TextInputInstance | null) => void;
};

export const SetField = memo(function SetField({
  field, value, ghost, single, boxed, editing, label, testID, onChange, onKeypad, register,
}: Props) {
  const { colors: t } = useTally();
  const ref = useRef<TextInputInstance>(null);
  useEffect(() => {
    register?.(ref.current);
    return () => register?.(null);
  }, [register]);
  const isTime = field === 't';
  const shown = isTime ? fmtDigits(value) : value;
  const placeholder = isTime ? fmtDigits(ghost) : ghost;
  const keypad = !!onKeypad;
  return (
    <TextInput ref={ref} value={shown} placeholder={placeholder || (isTime ? '0:00' : '')} placeholderTextColor={t.ink3}
      onChangeText={(v) => onChange(cleanInput(field, v))}
      onFocus={onKeypad}
      // the keypad is the keyboard; the phone's stays down
      showSoftInputOnFocus={keypad ? false : undefined} caretHidden={keypad && Platform.OS !== 'web'} contextMenuHidden={keypad}
      keyboardType={field === 'r' || isTime ? 'number-pad' : 'decimal-pad'} selectTextOnFocus={!keypad}
      inputAccessoryViewID={!keypad && Platform.OS === 'ios' ? KEYBOARD_BAR : undefined}
      accessibilityLabel={label} accessibilityHint={placeholder && !shown ? placeholder : undefined} testID={testID} maxLength={isTime ? 8 : 7}
      style={{
        ...TYPE.numberM, fontVariant: ['tabular-nums'], textAlign: 'center', color: t.ink,
        width: single ? FIELD_W.t : FIELD_W[field], height: 40, paddingHorizontal: 6, paddingVertical: 0, borderRadius: RADIUS.m,
        backgroundColor: editing ? t.paper : boxed ? t.paper3 : 'transparent',
        borderWidth: 2, borderColor: editing ? t.ink : 'transparent',
        // web: the keypad's ink box is the focus; an editor's field keeps the browser's ring
        ...(keypad && Platform.OS === 'web' ? { outlineStyle: 'none' } as object : null),
      }} />
  );
});
