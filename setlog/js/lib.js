// Single import point for the UI library (Preact + hooks + htm), vendored so the
// app works offline and needs no build step.
import { h, render, Fragment, createRef } from './vendor/preact.js';
import {
  useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback, useReducer,
} from './vendor/hooks.js';
import htm from './vendor/htm.js';

export const html = htm.bind(h);
export {
  h, render, Fragment, createRef,
  useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback, useReducer,
};
