export type Photo = {
	alt: string;
	thumb: { src: string; width: number; height: number };
	full: { src: string; width: number; height: number };
};

/** The sets of one document, by the key its `photos:` links use. */
export type Photos = Record<string, Photo[]>;
