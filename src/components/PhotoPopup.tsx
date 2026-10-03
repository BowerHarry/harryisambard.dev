import type { CSSProperties } from 'react';
import { FloatingPortal } from '@floating-ui/react';
import type { Photo } from './photo-types';

/** The strip of thumbnails that floats over a hovered phrase. */
export default function PhotoPopup({
	photos,
	setFloating,
	style,
	onMouseEnter,
	onMouseLeave,
	onPick,
}: {
	photos: Photo[];
	/** From `useFloating` in PhotoLayer, which positions this against the phrase. */
	setFloating: (node: HTMLElement | null) => void;
	style: CSSProperties;
	onMouseEnter: () => void;
	onMouseLeave: () => void;
	onPick: (index: number) => void;
}) {
	return (
		<FloatingPortal>
			<div
				ref={setFloating}
				style={style}
				className="photo-popup"
				onMouseEnter={onMouseEnter}
				onMouseLeave={onMouseLeave}
			>
				{photos.map((photo, index) => (
					<img
						key={photo.thumb.src}
						src={photo.thumb.src}
						alt={photo.alt}
						width={photo.thumb.width}
						height={photo.thumb.height}
						onClick={() => onPick(index)}
					/>
				))}
			</div>
		</FloatingPortal>
	);
}
