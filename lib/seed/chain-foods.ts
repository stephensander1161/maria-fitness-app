import type { FoodSeed } from "./foods";

/**
 * Restaurant menus, as published by the chains themselves.
 *
 * His ask: "look up menus of all the fast food chains and add their menus and
 * macros to our db so we can have accurate data, then 'small McDonald's fries'
 * is always right." It was always right *ish* before — the model estimated it,
 * which is a guess with a range around it for a number the chain prints.
 *
 * **Canadian figures**, because that is where these people eat. It is not a
 * detail: a medium McDonald's fries is 350 kcal in Canada and 320 in the US,
 * and the menus themselves differ — Tim Hortons, A&W's burgers, poutine.
 *
 * Three rules for anything added here.
 *
 * 1. **Per item, never per 100g.** Chains publish "1 sandwich — 520 kcal" and
 *    almost never what it weighs, so `perItem` is true and the figures are for
 *    one of the thing. Deriving a per-100g row would need a weight somebody
 *    made up. Where a weight *is* printed — fries, nuggets — `unitGrams`
 *    carries it, and a request in grams then converts honestly.
 * 2. **Available carbohydrate, not total.** Every nutrition panel prints total
 *    carbohydrate with fibre inside it; this app's `carbsG` is what is left
 *    after fibre, like every other row in the library. So `carbsG` here is
 *    total minus fibre, worked out at the point the row was written. Getting
 *    this backwards is the chia-seed bug from CLAUDE.md, at scale.
 * 3. **Nothing goes in unverified.** A number nobody published is worse than
 *    no row at all, because a row is believed. If a figure could not be found,
 *    the item is left out and the coach estimates it as it always did.
 *
 * Aliases carry the chain name, because that is how people say it: "mcdonalds
 * large fries", "tim hortons double double". `lib/search-terms.ts` handles the
 * spelling variants around that.
 */
export const CHAIN_FOODS: FoodSeed[] = [
  // ── McDonald's Canada ─────────────────────────────────────────────────────
  // Fries and poutine print a weight, so `unitGrams` carries it and "150g
  // mcdonalds fries" converts honestly. The sandwiches do not, and none is
  // invented for them.
  { slug: "mcdonalds-fries-small", name: "McDonald's Fries, small", category: "prepared", perItem: true, brand: "McDonald's Canada", kcal: 240, proteinG: 3, carbsG: 28, fatG: 11, fibreG: 3, unitGrams: 75, unitLabel: "small fries", aliases: ["mcdonalds small fries", "small fries mcdonalds", "mcdonalds french fries small", "small mcdonalds fries"] },
  { slug: "mcdonalds-fries-medium", name: "McDonald's Fries, medium", category: "prepared", perItem: true, brand: "McDonald's Canada", kcal: 350, proteinG: 4, carbsG: 42, fatG: 17, fibreG: 4, unitGrams: 110, unitLabel: "medium fries", aliases: ["mcdonalds medium fries", "mcdonalds fries", "medium mcdonalds fries", "mcdonalds french fries"] },
  { slug: "mcdonalds-fries-large", name: "McDonald's Fries, large", category: "prepared", perItem: true, brand: "McDonald's Canada", kcal: 560, proteinG: 6, carbsG: 68, fatG: 27, fibreG: 6, unitGrams: 178, unitLabel: "large fries", aliases: ["mcdonalds large fries", "large mcdonalds fries", "mcdonalds french fries large"] },
  { slug: "mcdonalds-poutine", name: "McDonald's Poutine", category: "prepared", perItem: true, brand: "McDonald's Canada", kcal: 510, proteinG: 17, carbsG: 41, fatG: 30, fibreG: 3, unitGrams: 225, unitLabel: "poutine", aliases: ["mcdonalds poutine", "mcpoutine"] },
  { slug: "mcdonalds-big-mac", name: "Big Mac", category: "prepared", perItem: true, brand: "McDonald's Canada", kcal: 520, proteinG: 24, carbsG: 42, fatG: 28, fibreG: 3, unitGrams: null, unitLabel: "Big Mac", aliases: ["mcdonalds big mac", "bigmac"] },
  { slug: "mcdonalds-quarter-pounder-cheese", name: "Quarter Pounder with Cheese", category: "prepared", perItem: true, brand: "McDonald's Canada", kcal: 520, proteinG: 30, carbsG: 38, fatG: 26, fibreG: 3, unitGrams: null, unitLabel: "burger", aliases: ["mcdonalds quarter pounder", "quarter pounder", "qpc"] },
  { slug: "mcdonalds-mcdouble", name: "McDouble", category: "prepared", perItem: true, brand: "McDonald's Canada", kcal: 370, proteinG: 21, carbsG: 32, fatG: 17, fibreG: 2, unitGrams: null, unitLabel: "burger", aliases: ["mcdonalds mcdouble"] },
  { slug: "mcdonalds-cheeseburger", name: "McDonald's Cheeseburger", category: "prepared", perItem: true, brand: "McDonald's Canada", kcal: 290, proteinG: 15, carbsG: 31, fatG: 11, fibreG: 2, unitGrams: null, unitLabel: "cheeseburger", aliases: ["mcdonalds cheeseburger"] },
  { slug: "mcdonalds-mcchicken", name: "McChicken", category: "prepared", perItem: true, brand: "McDonald's Canada", kcal: 470, proteinG: 16, carbsG: 41, fatG: 27, fibreG: 3, unitGrams: null, unitLabel: "sandwich", aliases: ["mcdonalds mcchicken", "mc chicken"] },
  { slug: "mcdonalds-filet-o-fish", name: "Filet-O-Fish", category: "prepared", perItem: true, brand: "McDonald's Canada", kcal: 400, proteinG: 14, carbsG: 39, fatG: 21, fibreG: 1, unitGrams: null, unitLabel: "sandwich", aliases: ["mcdonalds filet o fish", "fillet o fish", "filet o fish"] },
  /*
    Per nugget, not per box — and this one is worth the note.

    The boxes were the obvious rows: the panel prints 250 kcal for six and 410
    for ten. But the unit then *contains* a count, and "6 mcnuggets" reads as
    six boxes: 1500 calories for a 250 calorie snack, which is the exact shape
    of wrong this app must not be. Nobody orders "one six-piece"; they say a
    number of nuggets.

    So one nugget is the unit, divided out of the ten-piece panel — the larger
    of the two, so the rounding is smaller. It puts a six-piece at 246 against
    a printed 250, which is under two per cent and the honest cost of making
    the common sentence right.
  */
  { slug: "mcdonalds-mcnugget", name: "Chicken McNugget", category: "prepared", perItem: true, brand: "McDonald's Canada", kcal: 41, proteinG: 2.6, carbsG: 2.6, fatG: 2.3, fibreG: 0, unitGrams: null, unitLabel: "nugget", aliases: ["mcnugget", "mcnuggets", "chicken mcnuggets", "mcdonalds nuggets", "mcdonalds chicken nuggets"] },
  { slug: "mcdonalds-egg-mcmuffin", name: "Egg McMuffin", category: "prepared", perItem: true, brand: "McDonald's Canada", kcal: 290, proteinG: 16, carbsG: 27, fatG: 11, fibreG: 2, unitGrams: null, unitLabel: "McMuffin", aliases: ["mcdonalds egg mcmuffin", "egg mc muffin"] },
  { slug: "mcdonalds-hash-brown", name: "McDonald's Hash Brown", category: "prepared", perItem: true, brand: "McDonald's Canada", kcal: 160, proteinG: 1, carbsG: 14, fatG: 10, fibreG: 2, unitGrams: null, unitLabel: "hash brown", aliases: ["mcdonalds hash brown", "hashbrown"] },
  // ── Tim Hortons ───────────────────────────────────────────────────────────
  // The drinks print millilitres rather than grams, which is a volume and not
  // a weight — `unitGrams` stays null and the cup is the unit.
  { slug: "tims-iced-capp-medium", name: "Tim Hortons Iced Capp, medium", category: "drink", perItem: true, brand: "Tim Hortons", kcal: 360, proteinG: 3, carbsG: 48, fatG: 15, fibreG: 0, unitGrams: null, unitLabel: "medium", aliases: ["iced capp", "tim hortons iced capp", "icecapp", "ice capp"] },
  { slug: "tims-latte-medium", name: "Tim Hortons Latte, medium", category: "drink", perItem: true, brand: "Tim Hortons", kcal: 150, proteinG: 10, carbsG: 13, fatG: 6, fibreG: 0, unitGrams: null, unitLabel: "medium", aliases: ["tim hortons latte", "tims latte"] },
  { slug: "tims-boston-cream", name: "Tim Hortons Boston Cream Donut", category: "snack", perItem: true, brand: "Tim Hortons", kcal: 220, proteinG: 5, carbsG: 36, fatG: 6, fibreG: 1, unitGrams: null, unitLabel: "donut", aliases: ["boston cream donut", "tim hortons boston cream"] },
  { slug: "tims-honey-dip", name: "Tim Hortons Honey Dip Donut", category: "snack", perItem: true, brand: "Tim Hortons", kcal: 220, proteinG: 4, carbsG: 38, fatG: 6, fibreG: 1, unitGrams: null, unitLabel: "donut", aliases: ["honey dip donut", "honey dip"] },
  { slug: "tims-chocolate-dip", name: "Tim Hortons Chocolate Dip Donut", category: "snack", perItem: true, brand: "Tim Hortons", kcal: 200, proteinG: 4, carbsG: 33, fatG: 6, fibreG: 1, unitGrams: null, unitLabel: "donut", aliases: ["chocolate dip donut", "chocolate dip"] },
  { slug: "tims-apple-fritter", name: "Tim Hortons Apple Fritter", category: "snack", perItem: true, brand: "Tim Hortons", kcal: 310, proteinG: 7, carbsG: 51, fatG: 8, fibreG: 2, unitGrams: null, unitLabel: "fritter", aliases: ["apple fritter", "tim hortons apple fritter"] },
  // One Timbit, not a box: the panel is printed per Timbit, so "10 timbits"
  // multiplies the way anyone would expect.
  { slug: "tims-timbit-old-fashion-glazed", name: "Tim Hortons Timbit, old fashion glazed", category: "snack", perItem: true, brand: "Tim Hortons", kcal: 80, proteinG: 1, carbsG: 14, fatG: 3, fibreG: 0, unitGrams: null, unitLabel: "Timbit", aliases: ["timbit", "timbits", "tim hortons timbit"] },
  { slug: "tims-farmers-breakfast", name: "Tim Hortons Farmer's Breakfast Sandwich", category: "prepared", perItem: true, brand: "Tim Hortons", kcal: 660, proteinG: 21, carbsG: 46, fatG: 42, fibreG: 3, unitGrams: null, unitLabel: "sandwich", aliases: ["farmers breakfast sandwich", "tim hortons farmers breakfast"] },
  { slug: "tims-belt", name: "Tim Hortons Bagel B.E.L.T.", category: "prepared", perItem: true, brand: "Tim Hortons", kcal: 530, proteinG: 24, carbsG: 54, fatG: 24, fibreG: 7, unitGrams: null, unitLabel: "sandwich", aliases: ["belt bagel", "bagel belt", "tim hortons belt"] },
  { slug: "tims-chili", name: "Tim Hortons Chili", category: "prepared", perItem: true, brand: "Tim Hortons", kcal: 290, proteinG: 18, carbsG: 15, fatG: 16, fibreG: 5, unitGrams: null, unitLabel: "bowl", aliases: ["tim hortons chili", "tims chili"] },
  { slug: "tims-blueberry-muffin", name: "Tim Hortons Wild Blueberry Muffin", category: "snack", perItem: true, brand: "Tim Hortons", kcal: 340, proteinG: 5, carbsG: 55, fatG: 11, fibreG: 2, unitGrams: null, unitLabel: "muffin", aliases: ["tim hortons blueberry muffin", "blueberry muffin tim hortons"] },
  { slug: "tims-everything-bagel", name: "Tim Hortons Everything Bagel", category: "grain", perItem: true, brand: "Tim Hortons", kcal: 300, proteinG: 10, carbsG: 57, fatG: 3, fibreG: 3, unitGrams: null, unitLabel: "bagel", aliases: ["tim hortons bagel", "everything bagel tim hortons"] },
  // ── Subway Canada ─────────────────────────────────────────────────────────
  // Six-inch, which is the one people say. A footlong is close enough to two
  // that "2 × 6 inch" is the honest way to ask for one, and inventing separate
  // footlong rows from doubled figures would be arithmetic pretending to be a
  // published panel.
  { slug: "subway-turkey-breast-6", name: "Subway Turkey Breast, 6\"", category: "prepared", perItem: true, brand: "Subway Canada", kcal: 290, proteinG: 16, carbsG: 42, fatG: 4, fibreG: 5, unitGrams: null, unitLabel: "6 inch sub", aliases: ["subway turkey", "turkey breast sub", "subway turkey breast"] },
  { slug: "subway-italian-bmt-6", name: "Subway Italian B.M.T., 6\"", category: "prepared", perItem: true, brand: "Subway Canada", kcal: 410, proteinG: 19, carbsG: 42, fatG: 16, fibreG: 5, unitGrams: null, unitLabel: "6 inch sub", aliases: ["italian bmt", "subway bmt", "bmt sub"] },
  { slug: "subway-chicken-bacon-ranch-6", name: "Subway Chicken & Bacon Ranch, 6\"", category: "prepared", perItem: true, brand: "Subway Canada", kcal: 530, proteinG: 32, carbsG: 42, fatG: 24, fibreG: 5, unitGrams: null, unitLabel: "6 inch sub", aliases: ["chicken bacon ranch sub", "subway chicken bacon ranch"] },
  { slug: "subway-meatball-marinara-6", name: "Subway Meatball Marinara, 6\"", category: "prepared", perItem: true, brand: "Subway Canada", kcal: 480, proteinG: 21, carbsG: 52, fatG: 18, fibreG: 8, unitGrams: null, unitLabel: "6 inch sub", aliases: ["meatball sub", "subway meatball", "meatball marinara"] },
  { slug: "subway-steak-cheese-6", name: "Subway Steak & Cheese, 6\"", category: "prepared", perItem: true, brand: "Subway Canada", kcal: 380, proteinG: 26, carbsG: 44, fatG: 10, fibreG: 5, unitGrams: null, unitLabel: "6 inch sub", aliases: ["steak and cheese sub", "subway steak and cheese"] },
  { slug: "subway-tuna-6", name: "Subway Tuna, 6\"", category: "prepared", perItem: true, brand: "Subway Canada", kcal: 480, proteinG: 20, carbsG: 39, fatG: 25, fibreG: 5, unitGrams: null, unitLabel: "6 inch sub", aliases: ["subway tuna", "tuna sub"] },
  { slug: "subway-veggie-delite-6", name: "Subway Veggie Delite, 6\"", category: "prepared", perItem: true, brand: "Subway Canada", kcal: 230, proteinG: 8, carbsG: 39, fatG: 3, fibreG: 5, unitGrams: null, unitLabel: "6 inch sub", aliases: ["veggie delite", "subway veggie"] },
  { slug: "subway-oven-roasted-chicken-6", name: "Subway Oven Roasted Chicken, 6\"", category: "prepared", perItem: true, brand: "Subway Canada", kcal: 310, proteinG: 21, carbsG: 42, fatG: 5, fibreG: 5, unitGrams: null, unitLabel: "6 inch sub", aliases: ["subway chicken", "oven roasted chicken sub"] },
  // ── A&W Canada ────────────────────────────────────────────────────────────
  // The burgers come with and without cheese and the panels differ; each row
  // says which it is rather than averaging two real numbers into a third that
  // is neither.
  { slug: "aw-teen-burger", name: "A&W Teen Burger", category: "prepared", perItem: true, brand: "A&W Canada", kcal: 500, proteinG: 25, carbsG: 38, fatG: 26, fibreG: 1, unitGrams: null, unitLabel: "burger", aliases: ["teen burger", "a&w teen burger", "aw teen burger"] },
  { slug: "aw-mama-burger", name: "A&W Mama Burger", category: "prepared", perItem: true, brand: "A&W Canada", kcal: 400, proteinG: 19, carbsG: 37, fatG: 20, fibreG: 1, unitGrams: null, unitLabel: "burger", aliases: ["mama burger", "a&w mama burger", "aw mama burger"] },
  { slug: "aw-papa-burger", name: "A&W Papa Burger with cheese", category: "prepared", perItem: true, brand: "A&W Canada", kcal: 640, proteinG: 37, carbsG: 36, fatG: 37, fibreG: 1, unitGrams: null, unitLabel: "burger", aliases: ["papa burger", "a&w papa burger", "aw papa burger"] },
  { slug: "aw-fries", name: "A&W Fries, regular", category: "prepared", perItem: true, brand: "A&W Canada", kcal: 390, proteinG: 5, carbsG: 49, fatG: 18, fibreG: 5, unitGrams: 155, unitLabel: "regular fries", aliases: ["a&w fries", "aw fries"] },
  { slug: "aw-onion-rings", name: "A&W Onion Rings", category: "prepared", perItem: true, brand: "A&W Canada", kcal: 520, proteinG: 7, carbsG: 46, fatG: 32, fibreG: 4, unitGrams: 150, unitLabel: "portion", aliases: ["a&w onion rings", "aw onion rings", "onion rings"] },
  // ── KFC Canada ────────────────────────────────────────────────────────────
  // Chicken is priced per piece, because that is how it is ordered and how the
  // panel is printed — "3 pieces" then multiplies correctly.
  { slug: "kfc-original-thigh", name: "KFC Original Recipe Chicken Thigh", category: "prepared", perItem: true, brand: "KFC Canada", kcal: 220, proteinG: 15, carbsG: 6, fatG: 15, fibreG: 0, unitGrams: null, unitLabel: "piece", aliases: ["kfc thigh", "kfc chicken thigh", "original recipe thigh"] },
  { slug: "kfc-original-drumstick", name: "KFC Original Recipe Chicken Drumstick", category: "prepared", perItem: true, brand: "KFC Canada", kcal: 140, proteinG: 15, carbsG: 2, fatG: 8, fibreG: 0, unitGrams: null, unitLabel: "piece", aliases: ["kfc drumstick", "kfc chicken leg", "original recipe drumstick"] },
  { slug: "kfc-popcorn-chicken-small", name: "KFC Popcorn Chicken, small", category: "prepared", perItem: true, brand: "KFC Canada", kcal: 370, proteinG: 19, carbsG: 24, fatG: 21, fibreG: 2, unitGrams: 123, unitLabel: "small", aliases: ["kfc popcorn chicken", "popcorn chicken"] },
  { slug: "kfc-fries", name: "KFC Fries, individual", category: "prepared", perItem: true, brand: "KFC Canada", kcal: 300, proteinG: 4, carbsG: 37, fatG: 14, fibreG: 4, unitGrams: 113, unitLabel: "individual", aliases: ["kfc fries", "kfc french fries"] },
  { slug: "kfc-poutine", name: "KFC Poutine", category: "prepared", perItem: true, brand: "KFC Canada", kcal: 720, proteinG: 21, carbsG: 66, fatG: 40, fibreG: 6, unitGrams: 343, unitLabel: "poutine", aliases: ["kfc poutine"] },
  // ── Dairy Queen Canada ────────────────────────────────────────────────────
  { slug: "dq-blizzard-mint-oreo-small", name: "Dairy Queen Mint Oreo Blizzard, small", category: "snack", perItem: true, brand: "Dairy Queen Canada", kcal: 750, proteinG: 14, carbsG: 103, fatG: 23, fibreG: 1, unitGrams: null, unitLabel: "small", aliases: ["mint oreo blizzard", "dairy queen blizzard", "dq blizzard", "blizzard"] },
  { slug: "dq-vanilla-cone-small", name: "Dairy Queen Vanilla Cone, small", category: "snack", perItem: true, brand: "Dairy Queen Canada", kcal: 230, proteinG: 7, carbsG: 38, fatG: 7, fibreG: 0, unitGrams: null, unitLabel: "small cone", aliases: ["dairy queen cone", "dq cone", "vanilla cone"] },
  { slug: "dq-dilly-bar", name: "Dairy Queen Dilly Bar, chocolate", category: "snack", perItem: true, brand: "Dairy Queen Canada", kcal: 190, proteinG: 3, carbsG: 21, fatG: 10, fibreG: 0, unitGrams: null, unitLabel: "bar", aliases: ["dilly bar", "dq dilly bar"] },

  // ── Harvey's ──────────────────────────────────────────────────────────────
  { slug: "harveys-cheeseburger", name: "Harvey's Original Cheeseburger", category: "prepared", perItem: true, brand: "Harvey's", kcal: 420, proteinG: 22, carbsG: 35, fatG: 21, fibreG: 2, unitGrams: 162, unitLabel: "cheeseburger", aliases: ["harveys cheeseburger", "harveys burger"] },
  { slug: "harveys-poutine", name: "Harvey's Classic Poutine", category: "prepared", perItem: true, brand: "Harvey's", kcal: 730, proteinG: 24, carbsG: 60, fatG: 41, fibreG: 5, unitGrams: null, unitLabel: "poutine", aliases: ["harveys poutine"] },
  { slug: "harveys-fries", name: "Harvey's Fries, regular", category: "prepared", perItem: true, brand: "Harvey's", kcal: 430, proteinG: 5, carbsG: 55, fatG: 19, fibreG: 4, unitGrams: null, unitLabel: "regular fries", aliases: ["harveys fries"] },

  // ── Pizza Pizza ───────────────────────────────────────────────────────────
  // A New York slice is most of a meal, which is why it is worth a row: people
  // log "a slice" and mean this.
  { slug: "pizza-pizza-ny-pepperoni-slice", name: "Pizza Pizza New York Pepperoni Slice", category: "prepared", perItem: true, brand: "Pizza Pizza", kcal: 671, proteinG: 33, carbsG: 74, fatG: 25, fibreG: 4, unitGrams: null, unitLabel: "slice", aliases: ["pizza pizza slice", "new york pepperoni slice", "pizza pizza pepperoni slice"] },
];