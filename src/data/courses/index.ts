import type { AudioTrack, ChapterData, Course, GrammarSection } from "../../types";

import c1ch00 from "./contact-1/chapters/ch00.json";
import c1ch01 from "./contact-1/chapters/ch01.json";
import c1ch02 from "./contact-1/chapters/ch02.json";
import c1ch03 from "./contact-1/chapters/ch03.json";
import c1ch04 from "./contact-1/chapters/ch04.json";
import c1ch05 from "./contact-1/chapters/ch05.json";
import c1ch06 from "./contact-1/chapters/ch06.json";
import c1ch07 from "./contact-1/chapters/ch07.json";
import c1ch08 from "./contact-1/chapters/ch08.json";
import c1ch09 from "./contact-1/chapters/ch09.json";
import c1ch10 from "./contact-1/chapters/ch10.json";
import c1ch11 from "./contact-1/chapters/ch11.json";
import c1ch12 from "./contact-1/chapters/ch12.json";
import c1ch13 from "./contact-1/chapters/ch13.json";
import c1ch14 from "./contact-1/chapters/ch14.json";
import c1ch15 from "./contact-1/chapters/ch15.json";
import c1audio from "./contact-1/audio-manifest.json";

import c2ch01 from "./contact-2/chapters/ch01.json";
import c2ch02 from "./contact-2/chapters/ch02.json";
import c2ch03 from "./contact-2/chapters/ch03.json";
import c2ch04 from "./contact-2/chapters/ch04.json";
import c2ch05 from "./contact-2/chapters/ch05.json";
import c2ch06 from "./contact-2/chapters/ch06.json";
import c2ch07 from "./contact-2/chapters/ch07.json";
import c2ch08 from "./contact-2/chapters/ch08.json";
import c2ch09 from "./contact-2/chapters/ch09.json";
import c2ch10 from "./contact-2/chapters/ch10.json";
import c2ch11 from "./contact-2/chapters/ch11.json";
import c2ch12 from "./contact-2/chapters/ch12.json";
import c2ch13 from "./contact-2/chapters/ch13.json";
import c2ch14 from "./contact-2/chapters/ch14.json";
import c2ch15 from "./contact-2/chapters/ch15.json";
import c2audio from "./contact-2/audio-manifest.json";
import c2grammar from "./contact-2/grammar-reference.json";

import c3ch01 from "./contact-3/chapters/ch01.json";
import c3ch02 from "./contact-3/chapters/ch02.json";
import c3ch03 from "./contact-3/chapters/ch03.json";
import c3ch04 from "./contact-3/chapters/ch04.json";
import c3ch05 from "./contact-3/chapters/ch05.json";
import c3ch06 from "./contact-3/chapters/ch06.json";
import c3ch07 from "./contact-3/chapters/ch07.json";
import c3ch08 from "./contact-3/chapters/ch08.json";
import c3ch09 from "./contact-3/chapters/ch09.json";
import c3ch10 from "./contact-3/chapters/ch10.json";
import c3ch11 from "./contact-3/chapters/ch11.json";
import c3ch12 from "./contact-3/chapters/ch12.json";
import c3ch13 from "./contact-3/chapters/ch13.json";
import c3ch14 from "./contact-3/chapters/ch14.json";
import c3ch15 from "./contact-3/chapters/ch15.json";
import c3ch16 from "./contact-3/chapters/ch16.json";
import c3audio from "./contact-3/audio-manifest.json";
import c3grammar from "./contact-3/grammar-reference.json";

import c4ch01 from "./contact-4/chapters/ch01.json";
import c4ch02 from "./contact-4/chapters/ch02.json";
import c4ch03 from "./contact-4/chapters/ch03.json";
import c4ch04 from "./contact-4/chapters/ch04.json";
import c4ch05 from "./contact-4/chapters/ch05.json";
import c4ch06 from "./contact-4/chapters/ch06.json";
import c4ch07 from "./contact-4/chapters/ch07.json";
import c4ch08 from "./contact-4/chapters/ch08.json";
import c4ch09 from "./contact-4/chapters/ch09.json";
import c4ch10 from "./contact-4/chapters/ch10.json";
import c4ch11 from "./contact-4/chapters/ch11.json";
import c4ch12 from "./contact-4/chapters/ch12.json";
import c4ch13 from "./contact-4/chapters/ch13.json";
import c4ch14 from "./contact-4/chapters/ch14.json";
import c4ch15 from "./contact-4/chapters/ch15.json";
import c4ch16 from "./contact-4/chapters/ch16.json";
import c4ch17 from "./contact-4/chapters/ch17.json";
import c4audio from "./contact-4/audio-manifest.json";

export const contact1: Course = {
  id: "contact-1",
  bookNumber: 1,
  title: "Contact! nieuw 1",
  subtitle: "Intertaal · tekstboek & werkboek",
  chapters: [
    c1ch00,
    c1ch01,
    c1ch02,
    c1ch03,
    c1ch04,
    c1ch05,
    c1ch06,
    c1ch07,
    c1ch08,
    c1ch09,
    c1ch10,
    c1ch11,
    c1ch12,
    c1ch13,
    c1ch14,
    c1ch15,
  ] as unknown as ChapterData[],
  audioTracks: c1audio as AudioTrack[],
};

export const contact2: Course = {
  id: "contact-2",
  bookNumber: 2,
  title: "Contact! nieuw 2",
  subtitle: "Intertaal · tekstboek & werkboek",
  chapters: [
    c2ch01,
    c2ch02,
    c2ch03,
    c2ch04,
    c2ch05,
    c2ch06,
    c2ch07,
    c2ch08,
    c2ch09,
    c2ch10,
    c2ch11,
    c2ch12,
    c2ch13,
    c2ch14,
    c2ch15,
  ] as unknown as ChapterData[],
  audioTracks: c2audio as AudioTrack[],
  referenceGrammar: c2grammar as GrammarSection[],
};

export const contact3: Course = {
  id: "contact-3",
  bookNumber: 3,
  title: "Contact! nieuw 3",
  subtitle: "Intertaal · tekstboek & werkboek",
  chapters: [
    c3ch01,
    c3ch02,
    c3ch03,
    c3ch04,
    c3ch05,
    c3ch06,
    c3ch07,
    c3ch08,
    c3ch09,
    c3ch10,
    c3ch11,
    c3ch12,
    c3ch13,
    c3ch14,
    c3ch15,
    c3ch16,
  ] as unknown as ChapterData[],
  audioTracks: c3audio as AudioTrack[],
  referenceGrammar: c3grammar as GrammarSection[],
};

export const contact4: Course = {
  id: "contact-4",
  bookNumber: 4,
  title: "Contact! nieuw 4",
  subtitle: "Intertaal · tekstboek & werkboek",
  chapters: [
    c4ch01,
    c4ch02,
    c4ch03,
    c4ch04,
    c4ch05,
    c4ch06,
    c4ch07,
    c4ch08,
    c4ch09,
    c4ch10,
    c4ch11,
    c4ch12,
    c4ch13,
    c4ch14,
    c4ch15,
    c4ch16,
    c4ch17,
  ] as unknown as ChapterData[],
  audioTracks: c4audio as AudioTrack[],
};

/** Books that currently have content. */
export const courses: Course[] = [contact1, contact2, contact3, contact4];
