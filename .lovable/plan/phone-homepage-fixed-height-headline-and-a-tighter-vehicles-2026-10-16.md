# Phone homepage: fixed-height headline and a tighter vehicles section

Goal: on phones, the first vehicle listings show without scrolling as far. Desktop and tablet stay as they are.

## Headline (search card)
- The rotating headline always takes exactly 3 lines on phones, whatever the wording. Its height is locked, so the card never jumps.
- If a short version would fit in 2 lines, it sits at the bottom of that 3-line space, right above the "And so much more" line, rather than leaving a gap under it.
- If a long version would need more than 3 lines, the text shrinks slightly so it still fits in 3.
- "And so much more across Idaho and surrounding states." stays on one line: the text gets a bit smaller on narrow phones and won't wrap.

## Vehicles section below the card
- Less space between the search card and the "Cars & motors" label (about 24px instead of 56px on phones).
- "Vehicles for sale in Idaho" stays on one line: the heading is smaller on phones, and "All vehicles" sits beside it at a fixed size.
- The Cars, Motorcycles, RVs and other buttons sit in one swipeable row on phones, with no scrollbar showing. They're also a little shorter and smaller. On larger screens they wrap as they do now.

## Check
- At 393px wide, open the homepage and step through every headline version. Each one should take 3 lines, the card height should not change, and the slogan and vehicles heading should each stay on one line. The listing cards, or the getting-started card, should show higher up the screen than they do now.

## Technical details
- `src/routes/index.tsx`, hero: wrap the h1 in a container with a fixed 3.24em height on phones, using `flex flex-col justify-end`. Measure the headline after each change; if it runs taller than 3 lines, step its font size down from 22px to a minimum of 18px. Give the slogan `whitespace-nowrap text-[clamp(10.5px,3.1vw,12.5px)]`.
- `src/styles.css`: below 640px, `.homepage-hero-headline` uses a fixed height instead of a minimum height. The breakpoint rules above that stay the same.
- Vehicles section: change `mt-14` to `mt-6 sm:mt-14`. Make the h2 `whitespace-nowrap text-[19px] sm:text-[26px]` and give its column `min-w-0`. Make the link `shrink-0`. Change the button row to `no-scrollbar flex flex-nowrap overflow-x-auto sm:flex-wrap` with `shrink-0` buttons at `min-h-9`.
