// Live commentary, generated in the browser from what happens in the auction, in English,
// Hinglish or Marathi. No AI service or key: lines come from templates filled with the auction's
// own facts. Every device picks the same template for the same event (seeded by the event), so the
// stage, phones and console read alike. Uses only public facts; a team's money is mentioned only
// when the tournament shows purses to everyone.

import { money, category, roleId, teamSummary, basePrice, isAllotted } from './engine.js';

const MAX_LINES = 60;

export const LANGUAGES = { en: 'English', hi: 'Hinglish', mr: 'मराठी (Marathi)' };

function hash(s) {
  let h = 2166136261;
  for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
const pick = (list, seed) => list[hash(seed) % list.length];

/* ---------------- phrasebook ---------------- */
// Each entry gets the facts of one event and a seed, and returns one line.

const ROLE_WORDS = {
  en: { bat: 'batter', bowl: 'bowler', ar: 'all-rounder', wk: 'wicket-keeper' },
  hi: { bat: 'batter', bowl: 'bowler', ar: 'all-rounder', wk: 'wicket-keeper' },
  mr: { bat: 'फलंदाज', bowl: 'गोलंदाज', ar: 'अष्टपैलू', wk: 'यष्टिरक्षक' },
};

const PHRASES = {
  en: {
    stats: ({ mat, runs, wkts, wicketTaker }) => (wicketTaker ? `${wkts} wickets in ${mat} matches` : `${runs} runs${wkts ? ` and ${wkts} wickets` : ''} in ${mat} matches`),
    start: (f, k) => pick([
      `${f.name} is under way. ${f.teams} teams, ${f.toBuy} players each to buy.`,
      `Welcome to ${f.name}. ${f.teams} teams, squads of ${f.size}, and ${f.pool} players in the pool.`,
    ], k),
    up: (f, k) => {
      const how = f.how === 'chit' ? 'From the chits: ' : f.how === 'random' ? 'The draw brings up ' : 'Next up, ';
      return pick([`${how}${f.intro}. Bidding opens at ${f.base}.`, `${how}${f.intro}. Base price ${f.base}.`, `${how}${f.intro}. Who starts at ${f.base}?`], k);
    },
    squad: (f) => (f.full ? `${f.t} have a full squad of ${f.size}.` : `${f.t} now have ${f.count} of ${f.size}.`),
    purse: (f) => ` ${f.left} left in the purse.`,
    soldRecord: (f) => `Sold to ${f.t} for ${f.amt}. ${f.p} is the most expensive player of the auction so far.`,
    soldBase: (f, k) => pick([`${f.p} goes to ${f.t} at the base price, ${f.amt}. Good value.`, `${f.t} get ${f.p} for the base price.`], k),
    sold: (f, k) => pick([`Sold. ${f.p} joins ${f.t} for ${f.amt}.`, `${f.p} to ${f.t}, ${f.amt}.`, `Hammer down: ${f.p}, ${f.t}, ${f.amt}.`], k),
    unsoldAgain: (f, k) => pick([`No bids for ${f.p}. Back in the pool for the next round.`, `${f.p} goes unsold for now. Another chance in the next round.`], k),
    unsold: (f) => `No bids for ${f.p}. Unsold.`,
    undo: (f) => `Correction: the sale of ${f.p} to ${f.t} has been reversed.`,
    edit: (f) => `Correction: ${f.p} goes to ${f.t} for ${f.amt}.`,
    round: (f) => `Round ${f.r}. The unsold players are back for another chance.`,
    tie: (f) => `${f.ts} called ${f.amt} together. Tie-breaker draw: ${f.t} win it. Fortune favours the brave.`,
    end: (f) => `That is the end of the auction. ${f.count} players sold${f.top ? `; the top buy was ${f.top.p} to ${f.top.t} for ${f.top.amt}` : ''}.`,
    bidFirst: (f, k) => pick([`${f.t} open the bidding at ${f.amt}.`, `${f.t} make the first move, ${f.amt}.`, `First bid: ${f.t}, ${f.amt}.`], k),
    bidRecord: (f) => `${f.amt} from ${f.t}. That beats the highest price of the auction so far.`,
    bidWar: (f, k) => pick([`${f.t} and ${f.other} will not let go. ${f.amt} with ${f.t}.`, `Bidding war between ${f.t} and ${f.other}. ${f.amt}.`, `${f.other} against ${f.t} again. Now ${f.amt}.`], k),
    bidMultiple: (f) => `${f.t} take it to ${f.amt}, ${f.x} times the base price.`,
    bidJoin: (f, k) => pick([`${f.t} join in at ${f.amt}.`, `Here come ${f.t}, ${f.amt}.`], k),
    bid: (f, k) => pick([`${f.t} raise to ${f.amt}.`, `${f.amt} from ${f.t}.`, `${f.t} come back with ${f.amt}.`, `${f.t} go ${f.amt}.`], k),
    voiceOn: 'Commentary on.',
  },
  hi: {
    stats: ({ mat, runs, wkts, wicketTaker }) => (wicketTaker ? `${mat} matches mein ${wkts} wickets` : `${mat} matches mein ${runs} runs${wkts ? ` aur ${wkts} wickets` : ''}`),
    start: (f, k) => pick([
      `${f.name} shuru ho gaya hai. ${f.teams} teams, har team ko ${f.toBuy} players lene hain.`,
      `Swagat hai ${f.name} mein. ${f.teams} teams, ${f.size} players ka squad, aur pool mein ${f.pool} players.`,
    ], k),
    up: (f, k) => {
      const how = f.how === 'chit' ? 'Chit se naam nikla: ' : f.how === 'random' ? 'Draw mein aaye hain ' : 'Ab baari hai ';
      return pick([`${how}${f.intro}. Bidding shuru ${f.base} se.`, `${how}${f.intro}. Base price ${f.base}.`, `${how}${f.intro}. ${f.base} se kaun shuru karega?`], k);
    },
    squad: (f) => (f.full ? `${f.t} ka squad poora, ${f.size} players.` : `${f.t} ke paas ab ${f.count}/${f.size} players.`),
    purse: (f) => ` Purse mein ${f.left} bache.`,
    soldRecord: (f) => `${f.t} ne ${f.amt} mein khareed liya. ${f.p} ab tak ke sabse mehenge player.`,
    soldBase: (f, k) => pick([`${f.p} base price ${f.amt} pe ${f.t} mein. Badhiya deal.`, `${f.t} ko ${f.p} sirf base price mein mil gaye.`], k),
    sold: (f, k) => pick([`Sold. ${f.p} ab ${f.t} ke, ${f.amt} mein.`, `${f.p} gaye ${f.t} mein, ${f.amt}.`, `Hathoda gira: ${f.p}, ${f.t}, ${f.amt}.`], k),
    unsoldAgain: (f, k) => pick([`${f.p} ke liye koi bid nahi. Agle round mein phir mauka.`, `${f.p} abhi unsold. Agle round mein wapas aayenge.`], k),
    unsold: (f) => `${f.p} ke liye koi bid nahi. Unsold.`,
    undo: (f) => `Correction: ${f.p} ki ${f.t} wali sale cancel ho gayi hai.`,
    edit: (f) => `Correction: ${f.p} ab ${f.t} mein, ${f.amt}.`,
    round: (f) => `Round ${f.r}. Unsold players phir se auction mein.`,
    tie: (f) => `${f.ts} ne ek saath ${f.amt} bola. Tie-breaker draw: ${f.t} jeet gaye. Kismat bhi koi cheez hai.`,
    end: (f) => `Auction khatam. ${f.count} players bike${f.top ? `; sabse badi boli ${f.top.p} ki, ${f.top.t} ne ${f.top.amt} mein li` : ''}.`,
    bidFirst: (f, k) => pick([`${f.t} ne bidding shuru ki, ${f.amt}.`, `Pehli boli ${f.t} ki, ${f.amt}.`, `${f.t} ne pehla kadam uthaya, ${f.amt}.`], k),
    bidRecord: (f) => `${f.amt}, ${f.t} se. Is auction ki ab tak ki sabse oonchi boli se bhi zyada.`,
    bidWar: (f, k) => pick([`${f.t} aur ${f.other} mein jung chal rahi hai. ${f.amt} ${f.t} ki taraf se.`, `${f.t} aur ${f.other} peeche hatne ko taiyaar nahi. ${f.amt}.`, `${f.other} ke saamne phir ${f.t}. Ab ${f.amt}.`], k),
    bidMultiple: (f) => `${f.t} ne ${f.amt} tak pahuncha diya, base price ka ${f.x} guna.`,
    bidJoin: (f, k) => pick([`${f.t} bhi aa gaye, ${f.amt}.`, `Ab ${f.t} bhi maidan mein, ${f.amt}.`], k),
    bid: (f, k) => pick([`${f.t} ne badha ke ${f.amt} kiya.`, `${f.amt}, ${f.t} se.`, `${f.t} wapas aaye ${f.amt} ke saath.`, `${f.t}: ${f.amt}.`], k),
    voiceOn: 'Commentary chalu.',
  },
  mr: {
    stats: ({ mat, runs, wkts, wicketTaker }) => (wicketTaker ? `${mat} सामन्यांत ${wkts} बळी` : `${mat} सामन्यांत ${runs} धावा${wkts ? ` आणि ${wkts} बळी` : ''}`),
    start: (f, k) => pick([
      `${f.name} सुरू झाला आहे. ${f.teams} संघ, प्रत्येक संघाला ${f.toBuy} खेळाडू घ्यायचे आहेत.`,
      `${f.name} मध्ये आपले स्वागत. ${f.teams} संघ, ${f.size} खेळाडूंचा संघ, आणि पूलमध्ये ${f.pool} खेळाडू.`,
    ], k),
    up: (f, k) => {
      const how = f.how === 'chit' ? 'चिठ्ठीतून नाव आलं: ' : f.how === 'random' ? 'ड्रॉमधून आले ' : 'आता पुढचे खेळाडू, ';
      return pick([`${how}${f.intro}. बोली ${f.base} पासून सुरू.`, `${how}${f.intro}. मूळ किंमत ${f.base}.`, `${how}${f.intro}. ${f.base} पासून कोण सुरुवात करणार?`], k);
    },
    squad: (f) => (f.full ? `${f.t} चा संघ पूर्ण, ${f.size} खेळाडू.` : `${f.t} कडे आता ${f.count}/${f.size} खेळाडू.`),
    purse: (f) => ` पर्समध्ये ${f.left} शिल्लक.`,
    soldRecord: (f) => `${f.t} ने ${f.amt} ला घेतलं. ${f.p} आतापर्यंतचे सर्वात महागडे खेळाडू.`,
    soldBase: (f, k) => pick([`${f.p} मूळ किमतीत, ${f.amt} ला ${f.t} कडे. चांगला सौदा.`, `${f.t} ला ${f.p} फक्त मूळ किमतीत मिळाले.`], k),
    sold: (f, k) => pick([`विकले गेले. ${f.p} आता ${f.t} चे, ${f.amt} ला.`, `${f.p} ${f.t} कडे, ${f.amt}.`, `हातोडा पडला: ${f.p}, ${f.t}, ${f.amt}.`], k),
    unsoldAgain: (f, k) => pick([`${f.p} साठी एकही बोली नाही. पुढच्या फेरीत पुन्हा संधी.`, `${f.p} सध्या न विकले गेलेले. पुढच्या फेरीत परत येतील.`], k),
    unsold: (f) => `${f.p} साठी एकही बोली नाही. न विकले गेले.`,
    undo: (f) => `दुरुस्ती: ${f.p} ची ${f.t} कडे झालेली विक्री रद्द केली आहे.`,
    edit: (f) => `दुरुस्ती: ${f.p} आता ${f.t} कडे, ${f.amt} ला.`,
    round: (f) => `फेरी ${f.r}. न विकलेले खेळाडू पुन्हा लिलावात.`,
    tie: (f) => `${f.ts} यांनी एकाच वेळी ${f.amt} म्हटले. टाय-ब्रेकर सोडत: ${f.t} जिंकले. नशीब बलवत्तर!`,
    end: (f) => `लिलाव संपला. ${f.count} खेळाडू विकले गेले${f.top ? `; सर्वात मोठी बोली ${f.top.p} साठी, ${f.top.t} ने ${f.top.amt} ला घेतलं` : ''}.`,
    bidFirst: (f, k) => pick([`${f.t} ने ${f.amt} ने बोली सुरू केली.`, `पहिली बोली ${f.t} ची, ${f.amt}.`, `${f.t} ने पहिलं पाऊल टाकलं, ${f.amt}.`], k),
    bidRecord: (f) => `${f.t} कडून ${f.amt}. या लिलावातली आतापर्यंतची सर्वात मोठी बोली ओलांडली.`,
    bidWar: (f, k) => pick([`${f.t} आणि ${f.other} मध्ये चुरस. ${f.t} कडून ${f.amt}.`, `${f.t} आणि ${f.other} मागे हटायला तयार नाहीत. ${f.amt}.`, `पुन्हा ${f.other} विरुद्ध ${f.t}. आता ${f.amt}.`], k),
    bidMultiple: (f) => `${f.t} ने ${f.amt} पर्यंत नेलं, मूळ किमतीच्या ${f.x} पट.`,
    bidJoin: (f, k) => pick([`${f.t} पण आले, ${f.amt}.`, `आता ${f.t} मैदानात, ${f.amt}.`], k),
    bid: (f, k) => pick([`${f.t} ने वाढवून ${f.amt} केलं.`, `${f.t} कडून ${f.amt}.`, `${f.t} परत आले, ${f.amt}.`, `${f.t}: ${f.amt}.`], k),
    voiceOn: 'समालोचन सुरू.',
  },
};


/* ---------------- punchlines ---------------- */
// With humour on (the default; Setup → "Commentary humour"), lines get a friendly punchline. Jokes
// are about the auction, the money and the drama, never about a person. Plain bids get one only
// now and then, so the voice keeps up.

const JOKES = {
  en: {
    start: ['Captains, poker faces on please.', 'May your purses be deep and your regrets be few.', 'Calculators ready. Friendships on hold.'],
    upHitter: ['Strike rate {sr}: the ball has filed a police complaint.', 'Fielders in the deep, start stretching now.', 'Strike rate {sr}. Bowlers, this is your cue to look busy.'],
    upBowler: ['{wkts} wickets. Batters, act like you are not nervous.', 'Batters, quietly check your stance.', '{wkts} wickets. The stumps have trust issues.'],
    upAllRounder: ['Bats, bowls, and probably brings the snacks too.', 'Two players for the price of one. Allegedly.'],
    upNew: ['No stats yet. A mystery player, and mystery costs extra.', 'Zero stats, full confidence. We respect it.'],
    up: ['Wallets out, captains.', 'Captains, this is where the maths gets emotional.', 'Somebody\'s calculator is about to get a workout.', 'Act casual, captains. Everyone can see you counting.'],
    sold: ['Somewhere, a treasurer just sighed.', 'No refunds, no exchanges.', 'Welcome to the family. Snacks are on the new signing.', 'Done deal. The paddle can finally rest.'],
    soldBase: ['Bargain of the evening. The other captains are checking if they dozed off.', 'Steal deal. Someone call the police.', 'Base price! The other captains were busy doing maths.'],
    soldRecord: ['That is not a bid, that is a statement.', 'Somebody\'s piggy bank just retired.', 'Record price. The calculator needs a glass of water.'],
    unsold: ['The silence is loud. Comeback story loading.', 'Legends are often discovered late.', 'Even the chits feel bad. See you next round.'],
    bidFirst: ['And we are off!', 'First blood.', 'The ice is broken.'],
    bidWar: ['This is getting personal.', 'Grab the popcorn.', 'Nobody is blinking. Has anyone checked they are breathing?', 'This is less an auction, more a family feud.'],
    bidRecord: ['New territory. Oxygen masks may drop from the ceiling.', 'The record book is shaking.'],
    bidMultiple: ['The base price is now a distant memory.', 'At this rate, this one needs a bodyguard.'],
    bidJoin: ['A wild challenger appears!', 'Plot twist!', 'Look who woke up.'],
    bid: ['The paddle is getting a workout.', 'Tick tock.', 'Hold on to your purses.'],
    end: ['Captains, please return your calculators at the front desk.', 'Some will celebrate, some will explain to their team.'],
  },
  hi: {
    start: ['Captains, poker face on kar lo.', 'Purse bhaari ho, pachtawa halka.', 'Calculator taiyaar, dosti side mein.'],
    upHitter: ['Strike rate {sr}: ball ne police complaint kar di hai.', 'Boundary pe khade fielders, abhi se stretching shuru karo.', 'Strike rate {sr}. Bowlers, busy dikhne ka time hai.'],
    upBowler: ['{wkts} wickets. Batters, nervous mat dikhna.', 'Batters, chupke se apna stance check kar lo.', '{wkts} wickets. Stumps ko ab trust issues hain.'],
    upAllRounder: ['Batting, bowling, aur shayad snacks bhi yahi laayenge.', 'Ek ke daam mein do players. Aisa sunne mein aaya hai.'],
    upNew: ['Stats abhi nahi. Mystery player, aur mystery mehengi padti hai.', 'Stats zero, confidence full. Respect.'],
    up: ['Captains, wallet nikaalo.', 'Ab maths emotional hone wala hai.', 'Kisi ka calculator ab kaam pe lagega.', 'Captains, casual raho. Sab dekh rahe hain aap gin rahe ho.'],
    sold: ['Kahin ek treasurer ne lambi saans li.', 'No refund, no exchange.', 'Family mein swagat. Snacks naye player ki taraf se.', 'Deal pakki. Paddle ko ab aaram.'],
    soldBase: ['Shaam ki sabse sasti deal. Baaki captains so rahe the kya?', 'Chori ka maal! Koi police bulao.', 'Base price! Baaki captains maths mein busy the.'],
    soldRecord: ['Yeh bid nahi, statement hai.', 'Kisi ka gullak aaj retire ho gaya.', 'Record price. Calculator ko paani pilao.'],
    unsold: ['Sannata bol raha hai. Comeback story loading.', 'Legends der se pehchaane jaate hain.', 'Chit ko bhi bura laga. Agle round mein milte hain.'],
    bidFirst: ['Chalo shuru!', 'Pehla vaar.', 'Barf toot gayi.'],
    bidWar: ['Ab yeh personal ho gaya.', 'Popcorn le aao.', 'Koi palak nahi jhapka raha. Saans le rahe ho na?', 'Yeh auction kam, khandaani jhagda zyada lag raha hai.'],
    bidRecord: ['Nayi oonchai. Oxygen mask chhat se gir sakte hain.', 'Record book kaanp rahi hai.'],
    bidMultiple: ['Base price ab purani yaad hai.', 'Is rate pe inko apni security chahiye hogi.'],
    bidJoin: ['Naya challenger aa gaya!', 'Kahani mein twist!', 'Dekho kaun jaag gaya.'],
    bid: ['Paddle ki exercise ho rahi hai.', 'Tick tock.', 'Purse sambhaal ke.'],
    end: ['Captains, calculator wapas jama kar dena.', 'Kuch jashn manayenge, kuch team ko explain karenge.'],
  },
  mr: {
    start: ['कॅप्टन्स, चेहरा एकदम पोकर फेस ठेवा.', 'पर्स भरलेली असो, पश्चात्ताप कमी असो.', 'कॅल्क्युलेटर तयार, मैत्री बाजूला.'],
    upHitter: ['स्ट्राइक रेट {sr}: चेंडूने पोलिसात तक्रार केली आहे.', 'सीमारेषेवरच्या क्षेत्ररक्षकांनो, आत्तापासून वॉर्म-अप करा.', 'स्ट्राइक रेट {sr}. गोलंदाजांनो, कामात असल्यासारखं दाखवा.'],
    upBowler: ['{wkts} बळी. फलंदाजांनो, घाबरलेलं दाखवू नका.', 'फलंदाजांनो, हळूच आपला स्टान्स तपासा.', '{wkts} बळी. स्टंप्सचा आता कोणावर विश्वास नाही.'],
    upAllRounder: ['फलंदाजी, गोलंदाजी, आणि बहुतेक नाश्ताही हेच आणतील.', 'एकाच्या किमतीत दोन खेळाडू. असं ऐकिवात आहे.'],
    upNew: ['अजून आकडेवारी नाही. रहस्यमय खेळाडू, आणि रहस्य महाग पडतं.', 'आकडे शून्य, आत्मविश्वास पूर्ण. सलाम.'],
    up: ['कॅप्टन्स, पाकीट बाहेर काढा.', 'आता गणित भावनिक होणार आहे.', 'कोणाच्या तरी कॅल्क्युलेटरला आता काम मिळणार.', 'कॅप्टन्स, सहज राहा. तुम्ही मोजताय ते सगळ्यांना दिसतंय.'],
    sold: ['कुठेतरी एका खजिनदाराने मोठा सुस्कारा सोडला.', 'परतावा नाही, बदली नाही.', 'कुटुंबात स्वागत. नाश्ता नव्या खेळाडूकडून.', 'सौदा पक्का. पॅडलला आता विश्रांती.'],
    soldBase: ['आजच्या संध्याकाळचा सर्वात स्वस्त सौदा. बाकीचे कॅप्टन्स झोपले होते का?', 'हा तर चोरीचा माल! कोणीतरी पोलिसांना बोलवा.', 'मूळ किंमत! बाकीचे कॅप्टन्स गणितात गुंतले होते.'],
    soldRecord: ['ही बोली नाही, हे विधान आहे.', 'कोणाचा तरी गल्ला आज निवृत्त झाला.', 'विक्रमी किंमत. कॅल्क्युलेटरला पाणी द्या.'],
    unsold: ['शांतता खूप बोलकी आहे. पुनरागमनाची कथा लोड होत आहे.', 'दिग्गज उशिराच ओळखले जातात.', 'चिठ्ठीलाही वाईट वाटलं. पुढच्या फेरीत भेटू.'],
    bidFirst: ['चला, सुरुवात झाली!', 'पहिला घाव.', 'बर्फ फुटला.'],
    bidWar: ['आता हे वैयक्तिक झालंय.', 'पॉपकॉर्न आणा.', 'कोणीच पापणी हलवत नाहीये. श्वास घेताय ना?', 'हा लिलाव कमी, भाऊबंदकी जास्त वाटतेय.'],
    bidRecord: ['नवा उच्चांक. छतावरून ऑक्सिजन मास्क पडू शकतात.', 'विक्रमांचं पुस्तक थरथरतंय.'],
    bidMultiple: ['मूळ किंमत आता जुनी आठवण झाली.', 'या दराने यांना स्वतःचे सुरक्षारक्षक लागतील.'],
    bidJoin: ['नवा दावेदार आला!', 'कथेत ट्विस्ट!', 'बघा कोण जागं झालं.'],
    bid: ['पॅडलचा व्यायाम चालू आहे.', 'टिक टॉक.', 'पर्स सांभाळा.'],
    end: ['कॅप्टन्स, कॅल्क्युलेटर परत जमा करा.', 'काही जण जल्लोष करतील, काही जण संघाला स्पष्टीकरण देतील.'],
  },
};

const humourOn = (a) => a.rules.humour !== 'normal';
// A punchline for this kind of line (or '' when humour is off or it's a quiet turn).
function punch(a, lang, kind, key, facts = {}) {
  if (!humourOn(a)) return '';
  const J = JOKES[lang] || JOKES.en;
  if (kind === 'bid' && hash(`${key}:j`) % 3) return '';
  const list = J[kind];
  if (!list) return '';
  return ` ${pick(list, `${key}:j`).replace(/\{(\w+)\}/g, (_, k) => facts[k] ?? '')}`;
}

// Which kind of joke fits the player coming up.
function upKind(p) {
  const mat = Number(p.matches) || 0;
  const runs = Number(p.runs) || 0;
  const wkts = Number(p.wickets) || 0;
  const sr = Number(p.strikeRate) || 0;
  if (!mat) return 'upNew';
  if (sr >= 150 && runs >= 50) return 'upHitter';
  if (wkts && wkts >= mat * 0.6) return 'upBowler';
  if (roleId(p.role) === 'ar') return 'upAllRounder';
  return 'up';
}

/* ---------------- facts from the auction ---------------- */

const teamName = (a, id) => a.teams[id]?.name || id;

function intro(a, p, lang) {
  const L = PHRASES[lang];
  // With a single pool its name says nothing about the player, so leave it out.
  const pool = (a.rules.categories || []).length > 1 ? category(a.rules, p.category)?.label : null;
  const role = ROLE_WORDS[lang][roleId(p.role)];
  const runs = Number(p.runs) || 0;
  const wkts = Number(p.wickets) || 0;
  const mat = Number(p.matches) || 0;
  const stats = mat && (runs || wkts) ? L.stats({ mat, runs, wkts, wicketTaker: wkts && wkts * 15 > runs }) : '';
  return `${p.name}, ${[pool, role].filter(Boolean).join(' ')}${stats ? `, ${stats}` : ''}`;
}

// Highest price paid so far in this auction, leaving out `exceptPid`.
function recordPrice(a, exceptPid) {
  return Object.entries(a.sales).filter(([pid, s]) => pid !== exceptPid && !s.allotted && !s.retained)
    .reduce((m, [, s]) => Math.max(m, Number(s.price) || 0), 0);
}

function lineForLog(a, e, key, lang) {
  const L = PHRASES[lang];
  const p = a.players[e.playerId] || { name: '?' };
  const r = a.rules;
  const m = (n) => money(n, r);
  switch (e.type) {
    case 'start':
      return L.start({
        name: a.meta.name, teams: Object.keys(a.teams).length, size: r.squadSize,
        toBuy: r.squadSize - (r.leaders === 'captain_vc' ? 2 : 1), pool: Object.values(a.players).filter((x) => !isAllotted(x)).length,
      }, key) + punch(a, lang, 'start', key);
    case 'tie':
      return L.tie({ ts: (e.teams || []).map((t) => teamName(a, t)).join(' and '), t: teamName(a, e.team), amt: m(e.amount) }, key);
    case 'up':
      return L.up({ how: e.drawn, intro: intro(a, p, lang), base: m(e.amount) }, key) + punch(a, lang, upKind(p), key, { sr: Math.round(Number(p.strikeRate) || 0), wkts: Number(p.wickets) || 0 });
    case 'sold': {
      const t = teamName(a, e.team);
      const s = teamSummary(a, e.team);
      const f = { p: p.name, t, amt: m(e.amount), count: s.count, size: r.squadSize, full: s.toBuy === 0, left: m(s.remaining) };
      const tail = ` ${L.squad(f)}${r.purseVisibility === 'everyone' ? L.purse(f) : ''}`;
      const rec = recordPrice(a, e.playerId);
      if (rec && Number(e.amount) > rec) return L.soldRecord(f) + punch(a, lang, 'soldRecord', key) + tail;
      if (Number(e.amount) <= basePrice(p, r)) return L.soldBase(f, key) + punch(a, lang, 'soldBase', key) + tail;
      return L.sold(f, key) + punch(a, lang, 'sold', key) + tail;
    }
    case 'unsold':
      return (Number(a.meta.round || 1) <= Number(r.unsoldRounds) ? L.unsoldAgain({ p: p.name }, key) : L.unsold({ p: p.name })) + punch(a, lang, 'unsold', key);
    case 'undo':
      return L.undo({ p: p.name, t: teamName(a, e.team) });
    case 'edit':
      return L.edit({ p: p.name, t: teamName(a, e.team), amt: m(e.amount) });
    case 'round':
      return L.round({ r: e.round });
    case 'end': {
      const sales = Object.entries(a.sales).filter(([, s]) => !s.allotted && !s.retained).sort((x, y) => y[1].price - x[1].price);
      const top = sales[0];
      return L.end({ count: sales.length, top: top ? { p: a.players[top[0]]?.name, t: teamName(a, top[1].team), amt: m(top[1].price) } : null }) + punch(a, lang, 'end', key);
    }
    default:
      return null;
  }
}

function lineForBid(a, lot, bid, key, lang) {
  if (a.rules.showCurrentBid === false) return null; // bids stay off the screens in this tournament
  const L = PHRASES[lang];
  const f = { t: teamName(a, bid.team), amt: money(bid.amount, a.rules) };
  const p = a.players[a.live.playerId] || {};
  const before = lot.slice(0, -1);
  const j = (kind) => punch(a, lang, kind, key);
  if (!before.length) return L.bidFirst(f, key) + j('bidFirst');
  const rec = recordPrice(a, a.live.playerId);
  if (rec && Number(bid.amount) > rec && !before.some((b) => Number(b.amount) > rec)) return L.bidRecord(f) + j('bidRecord');
  const last4 = lot.slice(-4).map((b) => b.team);
  const pair = [...new Set(last4)];
  if (last4.length === 4 && pair.length === 2) return L.bidWar({ ...f, other: teamName(a, pair.find((x) => x !== bid.team)) }, key) + j('bidWar');
  const base = basePrice(p, a.rules);
  const x = Number(bid.amount) / base;
  if (x >= 3 && Math.floor(x) !== Math.floor((Number(before.at(-1).amount) || 0) / base)) return L.bidMultiple({ ...f, x: Math.floor(x) }) + j('bidMultiple');
  if (!before.some((b) => b.team === bid.team)) return L.bidJoin(f, key) + j('bidJoin');
  return L.bid(f, key) + j('bid');
}

/* ---------------- commentator ---------------- */

// Keeps the commentary for one page. Call update(auction) on every change; it calls onLine(line)
// for each new line ({ at, text, kind }) and keeps the history in .lines (newest first).
// lang: 'en' | 'hi' (Hinglish) | 'mr' (Marathi), or a function returning one.
// onLog(entry, auction): each new auction event (not the history), e.g. to ask the AI for a line.
// AI lines (auction.aicomm, written by the control room) join the commentary as kind 'ai'. While
// AI commentary is on, a built-in line for a player coming up, sold or unsold is shown but not
// read aloud; the AI line is read instead, or the built-in one after AI_WAIT if none arrives.
const AI_KINDS = ['up', 'sold', 'unsold'];
const AI_WAIT = 8000;
export function createCommentator({ onLine = () => {}, onLog = () => {}, lang = 'en' } = {}) {
  const seen = new Set();
  let ready = false;
  let lotId = null;
  let lot = []; // bids seen on the current player
  let lastAi = 0; // time of the newest AI line
  const language = () => { const l = typeof lang === 'function' ? lang() : lang; return PHRASES[l] ? l : 'en'; };
  const self = {
    lines: [],
    update(a) {
      if (!a || a.rules.commentary === false) return;
      const lg = language();
      const add = (text, at, kind, quiet) => {
        if (!text) return;
        const line = { at, text, kind, lang: lg };
        self.lines.unshift(line);
        self.lines.length = Math.min(self.lines.length, MAX_LINES);
        if (!quiet) onLine(line);
      };
      // Log events (players up, sales, unsold, rounds…), oldest first. On the first update the
      // recent history is filled in quietly.
      const entries = Object.entries(a.log).sort((x, y) => x[1].at - y[1].at);
      const fresh = entries.filter(([k]) => !seen.has(k));
      const history = ready ? fresh : fresh.slice(-8);
      fresh.forEach(([k]) => seen.add(k));
      // AI on, unless the control room has paused it after a failure (meta.aiStatus): then the
      // built-in line is read at once.
      const aiOn = !!a.meta?.aiCommentary && !(a.meta.aiStatus?.down && Number(a.meta.aiStatus.until) > Date.now());
      for (const [k, e] of history) {
        const waitForAi = ready && aiOn && AI_KINDS.includes(e.type);
        const text = lineForLog(a, e, k, lg);
        add(text, e.at, e.type, !ready || waitForAi);
        if (waitForAi && text) {
          const line = self.lines.find((x) => x.text === text && x.at === e.at);
          setTimeout(() => { if (lastAi < e.at && line) onLine(line); }, AI_WAIT);
        }
        if (ready) onLog(e, a);
      }
      // AI lines.
      const ai = Object.entries(a.aicomm || {}).sort((x, y) => x[1].at - y[1].at).filter(([k]) => !seen.has(`ai:${k}`));
      for (const [k, x] of (ready ? ai : ai.slice(-4))) {
        seen.add(`ai:${k}`);
        if (!x?.text) continue;
        lastAi = Math.max(lastAi, Number(x.event) || Number(x.at) || 0);
        const line = { at: x.at, text: String(x.text), kind: 'ai', lang: x.lang || lg };
        self.lines.unshift(line);
        self.lines.length = Math.min(self.lines.length, MAX_LINES);
        if (ready) onLine(line);
      }
      self.lines.sort((x, y) => y.at - x.at);
      // Bids on the player on the block.
      const live = a.live;
      if (live?.playerId !== lotId) { lotId = live?.playerId || null; lot = []; }
      const b = live?.status === 'bidding' ? live.bid : null;
      if (b?.team) {
        const key = `${live.playerId}:${b.amount}:${b.team}`;
        if (!seen.has(key)) {
          seen.add(key);
          if (lot.length && Number(lot.at(-1).amount) >= Number(b.amount)) lot = lot.filter((x) => Number(x.amount) < Number(b.amount)); // an undone bid
          lot.push({ team: b.team, amount: b.amount });
          if (ready) add(lineForBid(a, lot, b, key, lg), b.at || Date.now(), 'bid', false);
        }
      }
      ready = true;
    },
  };
  return self;
}

/* ---------------- voice ---------------- */

const VOICE_LANGS = { en: ['en-IN', 'en'], hi: ['en-IN', 'hi-IN', 'en'], mr: ['mr-IN', 'hi-IN'] };
const RUPEES = { en: 'rupees', hi: 'rupaye', mr: 'रुपये' };
const POINTS = { en: 'points', hi: 'points', mr: 'पॉइंट्स' };
const LAKH = { en: ['lakh', 'crore'], hi: ['lakh', 'crore'], mr: ['लाख', 'कोटी'] };

// Browsers don't say whether a voice is female or male, so the known names decide: Windows (Heera,
// Neerja, Swara / Ravi, Prabhat, Madhur), Apple (Veena, Isha, Lekha / Rishi), Android (en-in-x-ena…).
const FEMALE = /female|woman|heera|neerja|swara|kalpana|aarohi|veena|isha|lekha|kajal|aditi|raveena|priya|ananya|zira|samantha|en-in-x-(ena|enc|ahp)|hi-in-x-(hia|hic)/i;
const MALE = /\bmale|ravi\b|prabhat|madhur|hemant|rishi|kunal|aarav|manohar|en-in-x-(end|ene)|hi-in-x-(hid|hie)/i;
const genderOf = (v) => (FEMALE.test(`${v.name} ${v.voiceURI}`) ? 'female' : MALE.test(`${v.name} ${v.voiceURI}`) ? 'male' : '');
export const VOICE_CHOICES = { female: 'Indian female', male: 'Indian male' };
const VOICE_KEY = 'auctionxi:voice';

// Reads lines aloud with the browser's own speech (free, on the device). A new bid cuts off an
// older bid line so the voice keeps up with fast bidding. The voice is chosen per device: Indian
// female (the default), Indian male, or any voice installed for the language.
export function createVoice() {
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
  let on = false;
  let lastKind = null;
  const spoken = (t, lg) => t
    .replace(/₹\s?([\d.,]+)\s?Cr\b/g, `$1 ${LAKH[lg][1]} ${RUPEES[lg]}`)
    .replace(/₹\s?([\d.,]+)\s?L\b/g, `$1 ${LAKH[lg][0]} ${RUPEES[lg]}`)
    .replace(/₹\s?([\d,]+)/g, `$1 ${RUPEES[lg]}`)
    .replace(/([\d,]+) pts\b/g, `$1 ${POINTS[lg]}`);
  let choice = 'female';
  try { choice = localStorage.getItem(VOICE_KEY) || 'female'; } catch { /* private mode */ }
  // Voices for a language, best match first (exact locale, e.g. en-IN, before plain en).
  const voicesFor = (lg) => {
    const voices = synth?.getVoices() || [];
    const out = [];
    for (const want of VOICE_LANGS[lg] || VOICE_LANGS.en) {
      for (const v of voices) if ((v.lang === want || v.lang?.replace('_', '-').startsWith(want)) && !out.includes(v)) out.push(v);
    }
    return out;
  };
  const voiceFor = (lg) => {
    const list = voicesFor(lg);
    if (!list.length) return null;
    if (choice === 'female' || choice === 'male') {
      // The wanted kind in the best locale; a voice of unknown kind next; the other kind last.
      return list.find((v) => genderOf(v) === choice) || list.find((v) => !genderOf(v)) || list[0];
    }
    return list.find((v) => v.voiceURI === choice) || list.find((v) => genderOf(v) === 'female') || list[0];
  };
  const speak = (text, lg) => {
    const u = new SpeechSynthesisUtterance(spoken(text, lg));
    const v = voiceFor(lg);
    if (v) u.voice = v;
    u.lang = v?.lang || (lg === 'mr' ? 'mr-IN' : 'en-IN');
    u.rate = lg === 'en' ? 1.05 : 1;
    synth.speak(u);
  };
  return {
    supported: !!synth,
    get on() { return on; },
    get choice() { return choice; },
    // For a picker: Indian female, Indian male, then every voice this device has for the language.
    options(lg = 'en') {
      return [...Object.entries(VOICE_CHOICES).map(([value, label]) => ({ value, label })),
        ...voicesFor(lg).map((v) => ({ value: v.voiceURI, label: `${v.name} (${v.lang}${genderOf(v) ? `, ${genderOf(v)}` : ''})` }))];
    },
    // The voice that will actually speak, for a label such as "Heera (en-IN)".
    current(lg = 'en') { const v = synth && voiceFor(lg); return v ? `${v.name} (${v.lang})` : ''; },
    choose(value, lg = 'en') {
      choice = value || 'female';
      try { localStorage.setItem(VOICE_KEY, choice); } catch { /* private mode */ }
      if (on) { synth.cancel(); speak(PHRASES[lg]?.voiceOn || PHRASES.en.voiceOn, lg); }
    },
    // Voices load after the page on some browsers.
    onVoices(fn) { synth?.addEventListener?.('voiceschanged', fn); },
    // True when this device has a voice for the language (Marathi needs a Marathi or Hindi voice).
    hasVoice(lg) { return !!synth && (lg !== 'mr' || !!voiceFor('mr')); },
    toggle(lg = 'en') {
      on = !on && !!synth;
      if (!on) synth?.cancel();
      else speak(PHRASES[lg]?.voiceOn || PHRASES.en.voiceOn, lg);
      return on;
    },
    say(line) {
      if (!on || !synth) return;
      if (line.kind === 'bid' && lastKind === 'bid' && synth.speaking) synth.cancel();
      lastKind = line.kind;
      speak(line.text, line.lang || 'en');
    },
  };
}
