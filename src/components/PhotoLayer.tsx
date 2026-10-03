import { useRef, useState, type ReactNode } from 'react';
import { useFloating, offset, flip, shift, autoUpdate } from '@floating-ui/react';
import PhotoGallery from './PhotoGallery';
import PhotoPopup from './PhotoPopup';
import type { Photos } from './photo-types';

const HOVER_DELAY = 150;
const HIDE_DELAY = 200;

const isTouch = () => window.matchMedia('(pointer: coarse)').matches;

function phraseAt(target: EventTarget | null) {
	return (target as HTMLElement | null)?.closest?.('[data-photo-key]') as HTMLElement | null;
}

/**
 * Wraps a document and watches its `photos:` phrases: hovering one shows the
 * popup, clicking one opens the gallery. This holds the state for both.
 */
export default function PhotoLayer({
	photos = {},
	children,
}: {
	photos?: Photos;
	children?: ReactNode;
}) {
	const [popupKey, setPopupKey] = useState<string | null>(null);
	const [gallery, setGallery] = useState<{ key: string; index: number } | null>(null);

	const showTimer = useRef(0);
	const hideTimer = useRef(0);

	const { refs, floatingStyles } = useFloating({
		open: popupKey !== null,
		placement: 'top',
		middleware: [offset(8), flip(), shift({ padding: 8 })],
		whileElementsMounted: autoUpdate,
	});

	function openGallery(key: string, index: number) {
		setPopupKey(null);
		setGallery({ key, index });
	}

	function stepGallery(delta: number) {
		setGallery((g) => {
			if (!g) return g;
			const last = (photos[g.key] ?? []).length - 1;
			return { ...g, index: Math.max(0, Math.min(g.index + delta, last)) };
		});
	}

	function handleClick(event: React.MouseEvent) {
		const phrase = phraseAt(event.target);
		const key = phrase?.dataset.photoKey;
		if (key && photos[key]) openGallery(key, 0);
	}

	function handleMouseOver(event: React.MouseEvent) {
		if (isTouch()) return;
		const phrase = phraseAt(event.target);
		const key = phrase?.dataset.photoKey;
		if (!phrase || !key || !photos[key]) return;

		clearTimeout(hideTimer.current);
		clearTimeout(showTimer.current);
		showTimer.current = window.setTimeout(() => {
			refs.setReference(phrase);
			setPopupKey(key);
		}, HOVER_DELAY);
	}

	function scheduleHide() {
		clearTimeout(showTimer.current);
		hideTimer.current = window.setTimeout(() => setPopupKey(null), HIDE_DELAY);
	}

	function handleMouseOut(event: React.MouseEvent) {
		if (isTouch() || !phraseAt(event.target)) return;
		scheduleHide();
	}

	return (
		<>
			<div onClick={handleClick} onMouseOver={handleMouseOver} onMouseOut={handleMouseOut}>
				{children}
			</div>

			{popupKey && (
				<PhotoPopup
					photos={photos[popupKey] ?? []}
					setFloating={refs.setFloating}
					style={floatingStyles}
					onMouseEnter={() => clearTimeout(hideTimer.current)}
					onMouseLeave={scheduleHide}
					onPick={(index) => openGallery(popupKey, index)}
				/>
			)}

			{gallery && (
				<PhotoGallery
					photos={photos[gallery.key] ?? []}
					index={gallery.index}
					onStep={stepGallery}
					onClose={() => setGallery(null)}
				/>
			)}
		</>
	);
}
