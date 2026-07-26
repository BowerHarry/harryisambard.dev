import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useFloating, offset, flip, shift, autoUpdate, FloatingPortal } from '@floating-ui/react';

type Photo = {
	alt: string;
	thumb: { src: string; width: number; height: number };
	full: { src: string; width: number; height: number };
};

type Photos = Record<string, Photo[]>;

const HOVER_DELAY = 150;
const HIDE_DELAY = 200;

const isTouch = () => window.matchMedia('(pointer: coarse)').matches;

function phraseAt(target: EventTarget | null) {
	return (target as HTMLElement | null)?.closest?.('[data-photo-key]') as HTMLElement | null;
}

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

	useEffect(() => {
		if (!gallery) return;
		const count = (photos[gallery.key] ?? []).length;

		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') setGallery(null);
			if (event.key === 'ArrowRight')
				setGallery((g) => g && { ...g, index: Math.min(g.index + 1, count - 1) });
			if (event.key === 'ArrowLeft')
				setGallery((g) => g && { ...g, index: Math.max(g.index - 1, 0) });
		};

		document.addEventListener('keydown', onKeyDown);
		// The document pane is the scroller, not <body>; terminal.css freezes it
		// off this class so the page doesn't scroll behind the gallery.
		document.documentElement.classList.add('is-overlaid');
		return () => {
			document.removeEventListener('keydown', onKeyDown);
			document.documentElement.classList.remove('is-overlaid');
		};
	}, [gallery, photos]);

	function openGallery(key: string, index: number) {
		setPopupKey(null);
		setGallery({ key, index });
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

	const current = gallery ? photos[gallery.key]?.[gallery.index] : undefined;

	return (
		<>
			<div onClick={handleClick} onMouseOver={handleMouseOver} onMouseOut={handleMouseOut}>
				{children}
			</div>

			{popupKey && (
				<FloatingPortal>
					<div
						ref={refs.setFloating}
						style={floatingStyles}
						className="photo-popup"
						onMouseEnter={() => clearTimeout(hideTimer.current)}
						onMouseLeave={scheduleHide}
					>
						{(photos[popupKey] ?? []).map((photo, index) => (
							<img
								key={photo.thumb.src}
								src={photo.thumb.src}
								alt={photo.alt}
								width={photo.thumb.width}
								height={photo.thumb.height}
								onClick={() => openGallery(popupKey, index)}
							/>
						))}
					</div>
				</FloatingPortal>
			)}

			{current && (
				<FloatingPortal>
					<div
						className="photo-gallery"
						onClick={(event) => {
							if (event.target === event.currentTarget) setGallery(null);
						}}
					>
						<figure>
							<img
								src={current.full.src}
								alt={current.alt}
								width={current.full.width}
								height={current.full.height}
							/>
							<figcaption>{current.alt}</figcaption>
						</figure>
						<p className="photo-hint">
							<kbd>esc</kbd> close
							{(photos[gallery.key] ?? []).length > 1 && (
								<>
									{" · "}
									<kbd>←/→</kbd> browse {gallery.index + 1}/
									{(photos[gallery.key] ?? []).length}
								</>
							)}
						</p>
					</div>
				</FloatingPortal>
			)}
		</>
	);
}
