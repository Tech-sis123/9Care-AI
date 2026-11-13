import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getEducationModule, markModuleComplete } from '../lib/api';
import WhatsAppContact from '../components/WhatsAppContact';
import { MEDICAL_GLOSSARY, simplifyMedicalText, findGlossaryTerms } from '../lib/plainLanguage';
import { getVideoSource } from '../lib/videoEmbed';
import LessonComments from '../components/LessonComments';

const STATIC_MODULES = {
  'baby-growth': {
    id: 'baby-growth',
    type: 'Article',
    typeIcon: 'description',
    week: 'Week 12',
    tag: 'Baby Growth',
    duration: '4 min read',
    title: "Understanding Your Baby's Rapid Growth",
    subtitle: "Your baby is now the size of a sweet lime — and almost fully formed!",
    video_url: null,
    nextModule: { id: 'mindful-breathing', type: 'Audio', duration: '12 min', title: 'Mindful Breathing for Relief', icon: 'music_note' },
    sections: [
      {
        kind: 'intro',
        body: `At 12 weeks, you and your baby have reached a wonderful pregnancy milestone! Almost all of your baby's tiny body parts, organs, little fingers, and toes are now formed. From this week onward, your baby's main job is simply to grow bigger, stronger, and healthier until birth. Feeling big changes in your body is completely normal — knowing what is happening inside your belly will help you feel relaxed and confident.`,
      },
      {
        kind: 'body',
        heading: "What Is Happening Inside Your Belly This Week",
        body: `Your baby is about 5 to 6 centimeters long (roughly the size of a sweet lime or small plum) and weighs about 14 grams. The baby's face now looks unmistakably human, with eyes that have moved to the front and tiny ears forming.\n\nBaby's brain and tiny nerves are busy making connections so baby can begin moving. Even more amazing: the placenta (the afterbirth) is now fully working as your baby's private kitchen and oxygen supply! It delivers clean oxygen and nutritious food straight through the umbilical cord, and washes away waste. This is why drinking clean water and eating healthy local foods gives your baby so much strength right now.`,
      },
      {
        kind: 'highlight',
        icon: 'favorite',
        heading: "Did You Know?",
        body: `Your baby can already open and close their tiny fingers, curl their toes, and even make little sucking movements with their mouth! Baby is practicing these natural reflexes long before their first feed in your arms.`,
      },
      {
        kind: 'body',
        heading: "How Your Body Is Changing",
        body: `Here is comforting news: for most mothers, early morning sickness, nausea, and heavy tiredness start easing up around week 12! Your womb has grown to about the size of a grapefruit, and your doctor can now gently feel the top of it just above your lower belly bone.\n\nYour body is also creating extra blood — up to 50% more than usual — to feed your baby. Because of all this extra blood circulating, you may feel warmer than usual or notice your heart beating a bit faster. These are healthy signs that your body is doing wonderful work.`,
      },
      {
        kind: 'takeaways',
        heading: 'Key Things to Remember',
        items: [
          "The placenta (afterbirth) is now actively feeding and protecting your baby 24/7.",
          "All major body parts and organs are formed; baby is now growing larger every day.",
          "Your baby already has tiny fingernails and can curl their toes.",
          "Morning sickness and nausea usually start reducing from this week onward.",
          "Your doctor can now gently feel your womb from the outside during clinic checks.",
        ],
      },
      {
        kind: 'warning',
        heading: 'Contact Your Doctor or Clinic If You Notice',
        items: [
          'Any bright red vaginal bleeding or spotting',
          'Sharp belly cramps or lower tummy pain that does not ease',
          'High body fever (feeling hot or shivering)',
          'Sudden severe dizziness, fainting, or severe persistent headache',
        ],
      },
      {
        kind: 'body',
        heading: 'Your First Clinic Photo Scan (Ultrasound)',
        body: `Between weeks 11 and 13, you can get your first ultrasound photo scan at the clinic. This gentle, painless picture check lets you see your baby wiggling on the screen, confirms your exact due date, and checks baby's healthy development.\n\nDrink 4 to 6 cups of clean water before coming so your bladder is comfortably full — this helps the scanner take a crisp, clear picture of baby. The ultrasound gel may feel cool on your tummy, but the scan does not hurt at all and takes about 20 minutes.`,
      },
      {
        kind: 'highlight',
        icon: 'restaurant',
        heading: "Doctor's Nutrition Tip for Week 12",
        body: `Blood-building foods are super important right now! Excellent local Nigerian foods include fresh Ugu leaves, Ofe Akwu (banga soup with fish), Egusi soup with fish or meat, garden eggs, and beans. Squeeze a fresh orange or eat fresh tomatoes with your food — vitamin C helps your body absorb all the blood-building nutrients!`,
      },
    ],
    pidginSections: [
      {
        kind: 'intro',
        body: `As your belle don reach 12 weeks so, na big celebration! Almost all your baby body parts, tiny hands, fingers, and toes don form complete. From now go, baby job na to just grow big, get strong body, and dey healthy. All the changes wey you dey feel for body na normal thing — make you read this simple guide make your mind rest.`,
      },
      {
        kind: 'body',
        heading: "Wetin Dey Happen Inside Your Belle This Week",
        body: `Your baby now long reach about 5 to 6 centimeters (like the size of sweet lime or small plum). Baby face don dey clear well well, with small eyes and ears.\n\nThe afterbirth (placenta) don start work full time! Na him be baby kitchen and clean breeze pipe. E dey pass sweet nutrients and fresh oxygen straight through the cord enter baby body. Na why e dey very important make you dey chop good food and drink clean water every day.`,
      },
      {
        kind: 'highlight',
        icon: 'favorite',
        heading: "You Know Say?",
        body: `Your baby fit already open and close tiny fingers, bend toes, and even make mouth like say e dey suck breast! Baby dey practice all these things before birth.`,
      },
      {
        kind: 'body',
        heading: "How Your Body Dey Change",
        body: `Good news dey: that early morning vomiting and heavy tiredness wey dey worry you go start reduce from this 12 weeks! Your womb don grow reach size of grapefruit, and your nurse fit feel am gently for the lower part of your belle.\n\nYour body dey produce plenty extra blood to feed baby. That na why you fit dey feel hot small or feel your heart dey beat fast. No fear, na your strong body dey work.`,
      },
      {
        kind: 'takeaways',
        heading: 'Main Points Make You Hold',
        items: [
          "The placenta (afterbirth) don start to feed and protect baby 24/7.",
          "All baby main body parts don form complete; baby dey grow bigger now.",
          "Baby get tiny fingernails and fit curl toes inside belle.",
          "Morning vomiting and nausea dey reduce from this week go.",
          "Nurse fit feel your womb gently during your clinic checkup.",
        ],
      },
      {
        kind: 'warning',
        heading: 'Call Your Nurse Fast Fast If You Notice',
        items: [
          'Any fresh red blood coming out from your private part',
          'Sharp belle pain or heavy cramps wey no dey stop',
          'Hot body (fever) or shivering cold',
          'Heavy headache or darkness for eye',
        ],
      },
      {
        kind: 'body',
        heading: 'Your First Hospital Machine Picture Scan',
        body: `Between week 11 and 13, you go do your first ultrasound machine picture scan for clinic. This scan no dey pain at all! E go let you see your baby dey dance on screen and confirm when you go born.\n\nDrink 4 to 6 cups of water before you go make your bladder full small, e dey help the picture clear well well.`,
      },
      {
        kind: 'highlight',
        icon: 'restaurant',
        heading: 'Doctor Advice for Week 12 Food',
        body: `Chop foods wey dey give plenty blood! Local foods like fresh Ugu, Egusi soup with fish or beef, Ofe Akwu, and beans. Drink fresh orange juice or chop tomato join — vitamin C dey help your body absorb the blood food fast!`,
      },
    ],
  },

  'mindful-breathing': {
    id: 'mindful-breathing',
    type: 'Audio',
    typeIcon: 'music_note',
    week: 'Week 12',
    tag: 'Wellness & Comfort',
    duration: '12 min',
    title: 'Mindful Breathing for Fast Relief',
    subtitle: 'Simple, soothing breathing exercises to calm nausea, anxiety, and fatigue.',
    nextModule: { id: 'nutrition-iron-zinc', type: 'Article', duration: '5 min read', title: 'Nutrition Essentials: Foods That Build Blood', icon: 'description' },
    sections: [
      {
        kind: 'intro',
        body: `Breathing is something we do without thinking — but taking slow, intentional deep breaths is one of the easiest, natural tools you have during pregnancy. In this guide, you will learn 3 easy breathing techniques you can practice anywhere to stop sudden nausea, calm racing thoughts, and sleep peacefully.`,
      },
      {
        kind: 'body',
        heading: 'Why Deep Breathing Helps Your Body',
        body: `During pregnancy, your body needs extra oxygen to support both you and your growing baby. When you feel anxious or nauseous, your body becomes tense and your heartbeat quickens.\n\nTaking slow, deep breaths activates your body's natural relaxation system. This immediately lowers stress, calms your heart rate, and settles stomach sickness by telling your body: "You and your baby are safe."`,
      },
      {
        kind: 'takeaways',
        heading: 'Three Easy Breathing Steps to Try',
        items: [
          '4-7-8 Calm Breath: Breathe in through your nose for 4 counts, hold gently for 7 counts, then blow out slowly through your mouth for 8 counts. Repeat 4 times.',
          'Square Breathing: Breathe in 4, hold 4, breathe out 4, hold 4. Perfect for calming anxiety before clinic checkups.',
          'Belly Breathing: Place one hand on your chest and one on your belly. Breathe deeply so only your belly hand rises. This brings fresh oxygen deep down.',
        ],
      },
      {
        kind: 'highlight',
        icon: 'self_improvement',
        heading: 'Best Times to Use These Steps',
        body: `Try 4-7-8 breathing first thing in the morning if nausea strikes. Use square breathing in the clinic waiting room if you feel nervous. Practice belly breathing in bed at night to fall asleep gently.`,
      },
      {
        kind: 'warning',
        heading: 'Stop and Rest If You Feel',
        items: [
          'Dizziness or feeling lightheaded while breathing',
          'Shortness of breath that does not improve with quiet rest',
          'Chest pain or a racing heart that will not slow down',
        ],
      },
    ],
    pidginSections: [
      {
        kind: 'intro',
        body: `Breathing na wetin we dey do every second — but to take deep, gentle breath with purpose na one powerful medicine for pregnancy. For this lesson, you go learn 3 easy breathing tricks wey go help stop vomiting, calm your heart, and give you sweet sleep.`,
      },
      {
        kind: 'body',
        heading: 'Why Deep Breath Dey Help Your Body',
        body: `As you dey carry belle so, your body need extra breeze for you and baby. When you dey worry or when belle dey turn you, your body dey get tight and your heart dey beat fast.\n\nWhen you take deep, slow breath, your body dey receive signal say: "Everything dey fine." E go calm your heart, stop that sickness for throat, and relax your nerves.`,
      },
      {
        kind: 'takeaways',
        heading: 'Three Simple Steps Make You Try',
        items: [
          '4-7-8 Breath: Pull air enter nose count 1-2-3-4, hold am count 7, blow am out gently count 8. Do am 4 times.',
          'Box Breath: Pull air 4, hold 4, breathe out 4, hold 4. E good when you dey feel fear or anxiety.',
          'Belle Breathing: Put one hand on chest, one on belle. Breathe make only the hand on your belle move. E dey refresh whole body.',
        ],
      },
      {
        kind: 'highlight',
        icon: 'self_improvement',
        heading: 'When to Use Am',
        body: `Use 4-7-8 breath for morning when vomiting dey start. Use box breath before you enter clinic room if you dey tense. Do belle breathing for bed make you sleep soft.`,
      },
      {
        kind: 'warning',
        heading: 'Stop Rest If You Feel',
        items: [
          'Dizziness or turning eye',
          'Shortness of breath wey no gree calm down',
          'Chest tightness or heart wey dey jump fast',
        ],
      },
    ],
  },

  'nutrition-iron-zinc': {
    id: 'nutrition-iron-zinc',
    type: 'Article',
    typeIcon: 'description',
    week: 'Week 12',
    tag: 'Nutrition & Food',
    duration: '5 min read',
    title: 'Nutrition Essentials: Foods That Build Blood',
    subtitle: 'The best local Nigerian foods (Ugu, Beans, Egusi, Fish) to keep mama strong and baby growing.',
    nextModule: { id: 'first-scan', type: 'Article', duration: '3 min read', title: 'First Photo Scan: What to Expect', icon: 'description' },
    sections: [
      {
        kind: 'intro',
        body: `What you eat during pregnancy directly builds your baby's bones, brain, and blood. In the first months of pregnancy, your body needs extra blood-building minerals (iron) and cell-building nutrients (zinc). Many Nigerian mothers feel constantly weak because their blood level drops. Eating the right everyday market foods will keep your blood rich and give your baby the best start.`,
      },
      {
        kind: 'body',
        heading: 'Why Blood-Building Foods (Iron) Matter So Much',
        body: `Iron is the mineral your body uses to produce rich red blood. Because your baby needs nourishment, your body creates almost 50% more blood than normal! Without enough blood-building foods, you will feel tired, dizzy, weak, and out of breath. Having low blood (anemia) is one of the most common causes of fatigue during pregnancy.\n\nThe wonderful news: our Nigerian markets are full of rich blood-building foods that don't cost a fortune.`,
      },
      {
        kind: 'takeaways',
        heading: 'Best Local Nigerian Foods for Rich Blood',
        items: [
          'Ugu (fluted pumpkin leaves) — one of the richest natural blood-building leaves available locally!',
          'Beans — honey beans (oloyin), black-eyed peas, or brown beans prepared with fish.',
          'Beef liver or kidney — small cooked portions once or twice a week give high iron.',
          'Egusi soup cooked with fish, crayfish, and plenty green vegetables.',
          'Ofe Onugbu (bitter leaf soup) cooked with stockfish and meat.',
        ],
      },
      {
        kind: 'highlight',
        icon: 'tips_and_updates',
        heading: "Doctor's Secret: Boost Blood with Vitamin C!",
        body: `Your body absorbs iron from vegetables much faster when you eat them with vitamin C! Squeeze fresh orange or lemon into your water, or enjoy fresh oranges, tomatoes, and watermelon with your meals. Important tip: Avoid drinking hot black tea or coffee with your meals, because tea stops your body from absorbing blood nutrients!`,
      },
      {
        kind: 'body',
        heading: 'Foods for Baby Growth and Immunity (Zinc)',
        body: `Zinc is a mineral that helps your baby's cells divide cleanly and builds a tough immune system so your baby is protected against infections. It also helps your skin heal well.\n\nGreat local sources of zinc in Nigeria include boiled eggs, chicken, dried crayfish, groundnuts (peanuts), and egusi melon seeds. Eating these everyday foods ensures your baby grows strong without needing costly imports.`,
      },
      {
        kind: 'warning',
        heading: 'Foods to Avoid or Prepare Carefully',
        items: [
          'Raw or undercooked meat, unwashed vegetables, or raw runny eggs',
          'Unpasteurized raw milk or unboiled local soft cheese (wara)',
          'Excess herbal concoctions, agbo, or unprescribed medicines — always ask your nurse first',
          'Alcohol and cigarettes — no amount is safe for your growing baby',
        ],
      },
    ],
    pidginSections: [
      {
        kind: 'intro',
        body: `Wetin you dey chop na wetin dey build your baby body, brain, and blood. For early pregnancy, your body need minerals wey dey give rich blood (iron) and build baby cells (zinc). Plenty women for Nigeria dey feel weak because of low blood. When you chop the right local food, your body go get power and baby go grow well.`,
      },
      {
        kind: 'body',
        heading: 'Why Blood Food (Iron) Dey Very Important',
        body: `Iron na the thing wey your body dey take make strong red blood. Because baby need blood too, your body dey make 50% extra blood pass before! If you no chop blood foods, you go dey feel dizzy, weak, and tired.\n\nThe sweet thing be say our local market full of good blood foods wey no expensive at all.`,
      },
      {
        kind: 'takeaways',
        heading: 'Best Nigerian Foods Wey Dey Give Blood',
        items: [
          'Fresh Ugu leaves — one of the biggest blood-building leaves in our land!',
          'Beans — oloyin (honey beans) or brown beans with fish.',
          'Cooked liver or kidney — small portion once or twice a week.',
          'Egusi soup with plenty green leaf, fish, and crayfish.',
          'Bitter leaf soup (Ofe Onugbu) with stockfish.',
        ],
      },
      {
        kind: 'highlight',
        icon: 'tips_and_updates',
        heading: 'Nurse Secret: Add Vitamin C!',
        body: `Your body dey drink the blood food fast fast when you chop am with vitamin C! Chop fresh orange, tomato, or watermelon join your food. Nurse warning: No drink hot black tea or coffee immediately after food, because tea dey block the blood food make body no absorb am!`,
      },
      {
        kind: 'body',
        heading: 'Foods Wey Dey Build Baby Immunity (Zinc)',
        body: `Zinc na mineral wey dey make baby cell divide sharp sharp and build strong defense make baby no dey sick. Good local sources na boiled eggs, chicken, dried crayfish, groundnuts, and egusi seeds.`,
      },
      {
        kind: 'warning',
        heading: 'Foods Wey You Must Avoid',
        items: [
          'Raw or half-cooked meat, unwashed leaf, or raw eggs',
          'Raw unboiled milk or raw wara cheese',
          'Agbo, herbal concoctions, or self-prescribed drugs — ask your nurse first!',
          'Alcohol and cigarettes — zero alcohol for pregnant mama',
        ],
      },
    ],
  },

  'first-scan': {
    id: 'first-scan',
    type: 'Article',
    typeIcon: 'description',
    week: 'Week 11–13',
    tag: 'Clinic Care',
    duration: '3 min read',
    title: 'First Photo Scan: What to Expect',
    subtitle: 'A gentle, comforting guide to your first clinic ultrasound picture scan.',
    video_url: null,
    nextModule: { id: 'baby-growth', type: 'Article', duration: '4 min read', title: "Understanding Baby's Growth", icon: 'description' },
    sections: [
      {
        kind: 'intro',
        body: `Your first ultrasound scan is one of the most exciting and comforting moments of pregnancy! It is the very first time you will see your baby on the clinic monitor screen and hear their rapid little heartbeat. This guide walks you through what happens before, during, and after your scan so you can feel completely relaxed.`,
      },
      {
        kind: 'body',
        heading: 'What the Scan Checks',
        body: `The dating scan is done between 11 and 13 weeks. It confirms that your baby is safely nestled inside your womb (not in the fallopian tubes) and measures your baby from head to bottom to give you your exact due date.\n\nThe scan nurse or doctor also checks the tiny fluid cushion at the back of baby's neck. This routine measurement helps confirm that your baby's body and spine are forming normally. In almost every scan, everything looks completely healthy and reassuring.`,
      },
      {
        kind: 'takeaways',
        heading: 'How to Prepare for Your Scan',
        items: [
          'Drink 4 to 6 glasses of clean water about one hour before your scan and avoid using the toilet — a comfortably full bladder pushes your womb upward so the image is crystal clear!',
          'Bring your 9Care app, antenatal card, and any previous hospital notes.',
          'Wear loose, comfortable clothing (like a skirt and blouse) so you can easily uncover your belly.',
          'You can bring a support person with you — your partner, mother, or sister.',
          'The scan is 100% painless. A smooth cool gel is placed on your belly and the probe slides gently over it.',
        ],
      },
      {
        kind: 'highlight',
        icon: 'ultrasound',
        heading: 'What You Will See on the Screen',
        body: `At 12 weeks, your baby looks remarkably like a tiny human being! You will see baby's head, body, arms, and legs wiggling. You will also see a rapid flickering white dot — that is your baby's strong heartbeat, beating fast at 150 to 170 beats per minute! The scan doctor will point everything out to you.`,
      },
      {
        kind: 'body',
        heading: 'After Your Scan',
        body: `The clinic will give you printed photo pictures of your baby to take home and treasure! Your doctor will review the measurements with you and confirm your delivery date. If the doctor ever wants an extra checkup, do not be afraid — doctors do extra checks out of an abundance of caution to ensure mama and baby are protected.`,
      },
      {
        kind: 'warning',
        heading: 'Contact Your Clinic Immediately If You Notice',
        items: [
          'Any vaginal bleeding or spotting before or after your scan',
          'Sharp belly cramps or lower tummy pain',
          'High fever or chills',
          'Any worries or questions about what your scan report says',
        ],
      },
    ],
    pidginSections: [
      {
        kind: 'intro',
        body: `Your first ultrasound machine picture scan na one sweet and exciting moment! Na the first time wey you go see your pikin dey dance on screen and hear baby heartbeat fast fast. This guide go explain everything wey you need to know make your mind rest.`,
      },
      {
        kind: 'body',
        heading: 'Wetin the Scan Dey Check',
        body: `This first scan dey happen between week 11 and 13. E dey confirm say baby dey safely inside your womb and check how long baby be from head to yansh to confirm your exact delivery date.\n\nThe scan nurse go also measure the small water cushion for the back of baby neck to confirm say baby spine and body dey form well. For almost all scans, everything dey normal and fine.`,
      },
      {
        kind: 'takeaways',
        heading: 'How to Prepare Before You Go',
        items: [
          'Drink 4 to 6 cups of clean water one hour before your scan make your bladder full small — e dey make the scan picture clear well well!',
          'Carry your 9Care app and hospital card go.',
          'Wear comfortable up-and-down clothes make you fit expose your belle easy.',
          'You fit carry your husband, mama, or sister follow body.',
          'The scan no dey pain at all. Na just cool gel dem go rub on your belle.',
        ],
      },
      {
        kind: 'highlight',
        icon: 'ultrasound',
        heading: 'Wetin You Go See for Screen',
        body: `For 12 weeks, baby already look like real human being! You go see small legs, tiny hands, and one white light wey dey flicker fast fast — na your baby heartbeat be that (around 150 to 170 beats every minute)!`,
      },
      {
        kind: 'body',
        heading: 'After the Scan',
        body: `The hospital go give you paper picture of your baby carry go house show family! Your nurse go explain the result and confirm your delivery date. No need to fear anything at all.`,
      },
      {
        kind: 'warning',
        heading: 'Tell Nurse Fast Fast If You Notice',
        items: [
          'Any blood coming out from your private part',
          'Heavy belle pain or cramps',
          'Hot body (fever) or shaking cold',
          'Any question wey you no understand about the scan',
        ],
      },
    ],
  },
};

const wordCount = (text) => (text ? String(text).trim().split(/\s+/).length : 0);

// Content added from the doctor dashboard (has content_type set)
const GENERIC_TAKEAWAYS = {
  kind: 'takeaways',
  heading: 'Key Things to Remember',
  items: [
    'Take your daily blood and vitamin tablets (iron and folic acid) as advised by the clinic.',
    'Drink plenty of clean water every day to keep baby and yourself well hydrated.',
    'Attend all scheduled antenatal clinic visits with your nurse or doctor.',
  ],
};

const GENERIC_WARNING = {
  kind: 'warning',
  heading: 'When to Contact Your Clinic Immediately',
  items: [
    'Heavy vaginal bleeding or leaking of fluid from your private part',
    'Severe persistent headache, vision changes, or sudden severe swelling',
    'High fever or chills',
    'Noticeable decrease in baby movements or kicks',
  ],
};

const toManagedModule = (apiModule) => {
  const isVideo = apiModule.content_type === 'video';
  const isAudio = apiModule.content_type === 'audio';
  const readMinutes = Math.max(1, Math.round(wordCount(apiModule.body) / 200));
  const watchMinutes = Math.max(1, Math.round(wordCount(apiModule.transcript) / 150));
  return {
    id: apiModule.id,
    type: isVideo ? 'Video' : isAudio ? 'Audio' : 'Article',
    typeIcon: isVideo ? 'play_circle' : isAudio ? 'music_note' : 'description',
    week: apiModule.week_number ? `Week ${apiModule.week_number}` : 'Pregnancy Guide',
    tag: 'Pregnancy Care',
    duration: isVideo
      ? apiModule.transcript ? `${watchMinutes} min` : null
      : apiModule.body ? `${readMinutes} min read` : null,
    title: apiModule.title,
    subtitle: apiModule.summary || 'Antenatal care and maternal guidance.',
    video_url: isVideo ? apiModule.video_url : null,
    audio_url: apiModule.audio_url,
    article_url: apiModule.article_url,
    transcript: isVideo ? apiModule.transcript : null,
    nextModule: { id: 'baby-growth', type: 'Article', duration: '4 min read', title: "Understanding Baby's Growth", icon: 'description' },
    sections: [
      ...(apiModule.body ? [{ kind: 'body', heading: null, body: apiModule.body }] : []),
      GENERIC_TAKEAWAYS,
      GENERIC_WARNING,
    ],
  };
};

const typeColors = {
  Video:   { bg: 'bg-primary-fixed-dim', text: 'text-primary-container' },
  Audio:   { bg: 'bg-tertiary-fixed',    text: 'text-tertiary' },
  Article: { bg: 'bg-surface-container', text: 'text-on-surface-variant' },
};

const EducationDetail = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [completed, setCompleted] = useState(false);
  const [apiModule, setApiModule] = useState(null);

  // Reading mode: 'simple' (default, warm plain words), 'pidgin' (broken English), 'clinical' (standard)
  const [readingMode, setReadingMode] = useState('simple');
  const [selectedGlossaryTerm, setSelectedGlossaryTerm] = useState(null);
  const [showGlossaryModal, setShowGlossaryModal] = useState(false);
  const [transcriptOpen, setTranscriptOpen] = useState(false);

  useEffect(() => {
    if (!id) return;
    if (STATIC_MODULES[id]) {
      return;
    }
    getEducationModule(id)
      .then((r) => {
        if (r.data?.module) {
          setApiModule(r.data.module);
        }
      })
      .catch(() => {});
  }, [id]);

  const staticMatch = STATIC_MODULES[id];

  const mod = staticMatch || (apiModule?.content_type
    ? toManagedModule(apiModule)
    : apiModule
    ? {
        id: apiModule.id,
        type: apiModule.video_url ? 'Video' : apiModule.audio_url ? 'Audio' : 'Article',
        typeIcon: apiModule.video_url ? 'play_circle' : apiModule.audio_url ? 'music_note' : 'description',
        week: apiModule.week_number ? `Week ${apiModule.week_number}` : 'Pregnancy Guide',
        tag: 'Pregnancy Care',
        duration: apiModule.video_url ? '8 min' : apiModule.audio_url ? '10 min' : '5 min read',
        title: apiModule.title,
        subtitle: apiModule.summary ? apiModule.summary.slice(0, 110) + '...' : 'Antenatal care and maternal guidance.',
        video_url: apiModule.video_url,
        audio_url: apiModule.audio_url,
        nextModule: { id: 'baby-growth', type: 'Article', duration: '4 min read', title: "Understanding Baby's Growth", icon: 'description' },
        sections: [
          { kind: 'intro', body: apiModule.summary || 'Welcome to this week\'s pregnancy lesson.' },
          ...(apiModule.transcript ? [{ kind: 'highlight', icon: 'record_voice_over', heading: 'Pidgin Summary / Audio Transcript', body: apiModule.transcript }] : []),
          {
            kind: 'takeaways',
            heading: 'Key Things to Remember',
            items: [
              'Take your daily blood and vitamin tablets (iron and folic acid) as advised by the clinic.',
              'Drink plenty of clean water every day to keep baby and yourself well hydrated.',
              'Attend all scheduled antenatal clinic visits with your nurse or doctor.',
            ],
          },
          {
            kind: 'warning',
            heading: 'When to Contact Your Clinic Immediately',
            items: [
              'Heavy vaginal bleeding or leaking of fluid from your private part',
              'Severe persistent headache, vision changes, or sudden severe swelling',
              'High fever or chills',
              'Noticeable decrease in baby movements or kicks',
            ],
          },
        ],
        pidginSections: [
          { kind: 'intro', body: apiModule.transcript || apiModule.summary || 'Welcome to this week pregnancy lesson.' },
          {
            kind: 'takeaways',
            heading: 'Main Points Make You Remember',
            items: [
              'Take your daily blood tablets (iron and folic acid) everyday as nurse talk.',
              'Drink plenty clean water make you and your baby body dey fresh.',
              'No miss any clinic visit with your nurse or doctor at all.',
            ],
          },
          {
            kind: 'warning',
            heading: 'Go Hospital Fast Fast If You Notice',
            items: [
              'Any fresh blood or water wey dey leak from your private part',
              'Heavy headache wey no dey go, eye darkness, or swollen legs',
              'Hot body (fever) or shivering cold',
              'Baby stop kicking or moving as usual',
            ],
          },
        ],
      }
    : STATIC_MODULES['baby-growth']);

  const tc = typeColors[mod.type] || typeColors.Article;
  const isVideo = mod.type === 'Video' || !!mod.video_url;
  const isAudio = mod.type === 'Audio' || !!mod.audio_url;

  const videoSource = isVideo ? getVideoSource(mod.video_url) : null;

  // Choose sections based on reading mode
  const rawSections = readingMode === 'pidgin' && mod.pidginSections ? mod.pidginSections : mod.sections;

  // Process sections through the plain language simplifier
  const displaySections = rawSections.map((s) => {
    if (s.kind === 'intro') {
      return { ...s, body: simplifyMedicalText(s.body, readingMode) };
    }
    if (s.kind === 'body') {
      return { ...s, body: simplifyMedicalText(s.body, readingMode) };
    }
    if (s.kind === 'highlight') {
      return { ...s, body: simplifyMedicalText(s.body, readingMode) };
    }
    if (s.kind === 'takeaways') {
      return { ...s, items: s.items.map((item) => simplifyMedicalText(item, readingMode)) };
    }
    if (s.kind === 'warning') {
      return { ...s, items: s.items.map((item) => simplifyMedicalText(item, readingMode)) };
    }
    return s;
  });

  // Lesson title, badges and summary
  const lessonHeading = (
    <>
      <div className="px-5 pt-5 pb-4 flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className={`${tc.bg} ${tc.text} px-3 py-1 rounded-full font-label-sm text-[10px] uppercase tracking-wide flex items-center gap-1 font-semibold`}>
              <span className="material-symbols-outlined text-[12px]">{mod.typeIcon}</span>
              {mod.type}{mod.duration ? ` · ${mod.duration}` : ''}
            </span>
            <span className="bg-tertiary-fixed text-primary px-3 py-1 rounded-full font-label-sm text-[10px] uppercase tracking-wide font-semibold">
              {mod.week}
            </span>
            {!isVideo && (
              <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-full text-[10px] font-semibold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 inline-block" />
                Mama-Friendly Language
              </span>
            )}
          </div>
          <h2 className="font-headline-lg text-primary text-xl leading-snug font-bold">{mod.title}</h2>
          <p className="text-on-surface-variant text-sm mt-1">{mod.subtitle}</p>
        </div>
      </div>
    </>
  );

  return (
    <div className="font-body-md text-on-surface min-h-screen">
      <div className="grain-overlay" />

      <main className="max-w-[640px] mx-auto min-h-screen bg-surface-container-low relative flex flex-col">
        {/* STICKY HEADER */}
        <header className="bg-primary text-on-primary sticky top-0 z-50 px-4 py-3 flex items-center gap-3 shadow-sm">
          <button
            type="button"
            onClick={() => navigate('/education')}
            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors flex-shrink-0 cursor-pointer"
          >
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <div className="flex-1 min-w-0">
            <p className="font-label-sm text-[10px] uppercase tracking-widest text-on-primary-container opacity-80">
              {mod.week} · {mod.tag}
            </p>
            <h1 className="font-headline-md text-sm leading-tight truncate">{mod.title}</h1>
          </div>
        </header>

        {/* ── VIDEO / AUDIO / ARTICLE HEADER ── */}
        {isVideo ? (
          <div className="relative aspect-video bg-black overflow-hidden shadow-xl flex-shrink-0">
            {videoSource?.kind === 'iframe' ? (
              <iframe
                className="w-full h-full"
                src={videoSource.src}
                title={mod.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            ) : videoSource?.kind === 'file' ? (
              <video
                controls
                className="w-full h-full object-contain"
                src={videoSource.src}
                poster="https://images.unsplash.com/photo-1584515933487-779824d29309?w=640&q=80"
              />
            ) : videoSource?.kind === 'link' ? (
              <div className="w-full h-full flex flex-col items-center justify-center gap-3 p-6 text-center bg-gradient-to-br from-stone-900 to-stone-950">
                <span className="material-symbols-outlined text-4xl text-amber-200">smart_display</span>
                <a
                  href={videoSource.src}
                  target="_blank"
                  rel="noreferrer"
                  className="px-4 py-2 rounded-full bg-white text-stone-900 text-xs font-bold flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-sm">open_in_new</span>
                  Watch the video
                </a>
              </div>
            ) : (
              <div className="w-full h-full relative flex flex-col items-center justify-center p-6 text-center overflow-hidden bg-gradient-to-br from-stone-900 via-stone-850 to-stone-950">
                <div
                  className="absolute inset-0 opacity-15 bg-cover bg-center pointer-events-none"
                  style={{ backgroundImage: `url('https://images.unsplash.com/photo-1584515933487-779824d29309?w=640&q=80')` }}
                />
                <div className="relative z-10 flex flex-col items-center max-w-xs">
                  <div className="w-14 h-14 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20 mb-3 shadow-lg">
                    <span className="material-symbols-outlined text-3xl text-amber-200">smart_display</span>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-white/15 text-white/90 border border-white/15 mb-2">
                    Clinical Video Lesson
                  </span>
                  <p className="text-sm font-semibold text-white">Video Demonstration in Preparation</p>
                  <p className="text-xs text-white/60 mt-1 leading-relaxed">
                    Our medical team is producing this video demonstration. Please review the complete clinical guide and care instructions below.
                  </p>
                </div>
              </div>
            )}
          </div>
        ) : isAudio ? (
          <div className="bg-primary px-6 py-8 flex flex-col items-center gap-5 flex-shrink-0">
            <div className="w-24 h-24 bg-primary-container rounded-full flex items-center justify-center shadow-lg">
              <span className="material-symbols-outlined text-on-primary-container text-5xl" style={{ fontVariationSettings: "'FILL' 1" }}>
                headphones
              </span>
            </div>
            <div className="text-center">
              <p className="font-headline-md text-on-primary text-base font-bold">{mod.title}</p>
              <p className="text-on-primary-container text-xs opacity-80 mt-1">{mod.week} • {mod.duration}</p>
            </div>
            {mod.audio_url && (
              <audio controls className="w-full max-w-sm mt-2" src={mod.audio_url} />
            )}
          </div>
        ) : (
          <div className="bg-tertiary-fixed px-6 py-6 flex items-center gap-4 flex-shrink-0 border-b border-primary/10">
            <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-primary shadow-xs shrink-0">
              <span className="material-symbols-outlined text-2xl">description</span>
            </div>
            <div>
              <span className="font-label-sm text-[10px] uppercase tracking-widest text-primary font-bold">
                {mod.week} • Reading Article
              </span>
              <h3 className="font-headline-md text-sm text-primary font-bold leading-snug">{mod.title}</h3>
            </div>
          </div>
        )}

        {/* ── VIDEO: title and summary, transcript, then comments, all visible without scrolling far ── */}
        {isVideo && (
          <>
            {lessonHeading}
            {mod.transcript && (
              <div className="px-5 pt-4">
                <div className="bg-surface-container-lowest border border-amber-900/10 rounded-2xl shadow-xs overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setTranscriptOpen((o) => !o)}
                    aria-expanded={transcriptOpen}
                    className="w-full px-4 py-3 flex items-center justify-between gap-3 cursor-pointer"
                  >
                    <span className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[18px] text-primary">subtitles</span>
                      Video Transcript
                    </span>
                    <span className="text-[11px] font-semibold text-primary flex items-center gap-0.5">
                      {transcriptOpen ? 'Hide' : 'Read along'}
                      <span className="material-symbols-outlined text-[16px]">{transcriptOpen ? 'expand_less' : 'expand_more'}</span>
                    </span>
                  </button>
                  {transcriptOpen ? (
                    <div className="px-4 pb-4 max-h-96 overflow-y-auto text-sm text-on-surface-variant leading-relaxed whitespace-pre-wrap border-t border-amber-900/10 pt-3">
                      {mod.transcript}
                    </div>
                  ) : (
                    <p className="px-4 pb-3 text-xs text-on-surface-variant/80 line-clamp-2">{mod.transcript}</p>
                  )}
                </div>
              </div>
            )}

            {apiModule?.id && !staticMatch && (
              <div className="pt-5">
                <LessonComments moduleId={apiModule.id} />
              </div>
            )}
            <div className="h-px bg-outline-variant/20 mx-5" />
          </>
        )}

        {/* ── READING MODE SELECTOR (articles only; videos have no text to switch) ── */}
        {!isVideo && (
        <div className="px-5 pt-4">
          <div className="bg-surface-container-lowest border border-amber-900/10 rounded-2xl p-3 shadow-xs">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-amber-950 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px] text-amber-600">translate</span>
                Article Language & Simplicity
              </span>
              <button
                type="button"
                onClick={() => setShowGlossaryModal(true)}
                className="text-[10.5px] font-semibold text-primary hover:underline flex items-center gap-1 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[14px]">help</span>
                Word Explainer
              </button>
            </div>

            <div className="grid grid-cols-3 gap-1.5 bg-surface-container-high p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setReadingMode('simple')}
                className={`py-1.5 px-2 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-1 ${
                  readingMode === 'simple'
                    ? 'bg-white text-primary shadow-xs font-bold'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                <span>👶</span>
                <span className="truncate">Simple English</span>
              </button>
              <button
                type="button"
                onClick={() => setReadingMode('pidgin')}
                className={`py-1.5 px-2 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-1 ${
                  readingMode === 'pidgin'
                    ? 'bg-white text-primary shadow-xs font-bold'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                <span>🇳🇬</span>
                <span className="truncate">Pidgin</span>
              </button>
              <button
                type="button"
                onClick={() => setReadingMode('clinical')}
                className={`py-1.5 px-2 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-1 ${
                  readingMode === 'clinical'
                    ? 'bg-white text-primary shadow-xs font-bold'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                <span>🩺</span>
                <span className="truncate">Clinical</span>
              </button>
            </div>

            <p className="text-[10px] text-on-surface-variant/80 mt-2 px-1 leading-relaxed">
              {readingMode === 'simple' && '✨ Plain everyday English with zero hard medical words — easy for every mother.'}
              {readingMode === 'pidgin' && '🇳🇬 Sweet everyday Nigerian Pidgin breaking down everything step-by-step.'}
              {readingMode === 'clinical' && '🩺 Standard clinical medical terms used in formal hospital reports.'}
            </p>
          </div>
        </div>
        )}

        {/* ── CONTENT BODY ── */}
        <div className="flex-1 flex flex-col pb-40">
          {!isVideo && (
            <>
              {lessonHeading}
              <div className="h-px bg-outline-variant/20 mx-5" />
            </>
          )}

          {/* Content sections */}
          <div className="px-5 py-6 space-y-8">
            {displaySections.map((s, i) => {
              if (s.kind === 'intro') {
                return (
                  <p key={i} className="font-body-lg text-on-surface leading-relaxed text-base">
                    {s.body}
                  </p>
                );
              }

              if (s.kind === 'body') {
                return (
                  <div key={i} className="space-y-3">
                    {s.heading && <h3 className="font-headline-md text-primary text-base font-bold">{s.heading}</h3>}
                    {s.body.split('\n\n').map((para, j) => (
                      <p key={j} className="font-body-md text-on-surface-variant leading-relaxed text-sm">
                        {para}
                      </p>
                    ))}
                  </div>
                );
              }

              if (s.kind === 'takeaways') {
                return (
                  <div key={i} className="bg-surface-container-high rounded-xl p-5 space-y-4">
                    <h3 className="font-label-sm uppercase tracking-widest text-primary border-b border-primary/10 pb-2 text-xs font-bold">
                      {s.heading}
                    </h3>
                    <ul className="space-y-3">
                      {s.items.map((item, j) => (
                        <li key={j} className="flex gap-3 items-start">
                          <span
                            className="material-symbols-outlined text-primary-container mt-0.5 flex-shrink-0 text-[18px]"
                            style={{ fontVariationSettings: "'FILL' 1" }}
                          >
                            check_circle
                          </span>
                          <span className="font-body-md text-on-surface text-sm leading-relaxed">{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              }

              if (s.kind === 'highlight') {
                return (
                  <div key={i} className="bg-tertiary-fixed border border-primary/10 rounded-xl p-5 flex gap-4">
                    <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center flex-shrink-0 shadow-sm">
                      <span className="material-symbols-outlined text-primary text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>
                        {s.icon}
                      </span>
                    </div>
                    <div className="space-y-1">
                      <h4 className="font-label-sm text-primary uppercase tracking-widest text-[10px] font-bold">
                        {s.heading}
                      </h4>
                      <p className="font-body-md text-tertiary leading-relaxed text-sm">{s.body}</p>
                    </div>
                  </div>
                );
              }

              if (s.kind === 'warning') {
                return (
                  <div key={i} className="border border-secondary/20 bg-secondary-fixed/30 rounded-xl p-5 space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-secondary text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>
                        warning
                      </span>
                      <h3 className="font-label-sm uppercase tracking-widest text-secondary text-xs font-bold">
                        {s.heading}
                      </h3>
                    </div>
                    <ul className="space-y-2">
                      {s.items.map((item, j) => (
                        <li key={j} className="flex gap-3 items-start">
                          <span className="w-1.5 h-1.5 bg-secondary rounded-full mt-2 flex-shrink-0" />
                          <span className="font-body-md text-on-surface text-sm leading-relaxed">{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              }

              return null;
            })}
          </div>

          {/* Link to the original article */}
          {mod.article_url && (
            <div className="px-5 pb-6">
              <a
                href={mod.article_url}
                target="_blank"
                rel="noreferrer"
                className="w-full py-3 rounded-xl bg-primary text-white text-sm font-semibold flex items-center justify-center gap-2 shadow-md hover:bg-primary/90"
              >
                <span className="material-symbols-outlined text-base">open_in_new</span>
                Read the full article
              </a>
            </div>
          )}

          {/* Quick Explainer helper card */}
          <div className="mx-5 p-4 rounded-xl bg-primary/5 border border-primary/15 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary text-lg">💡</span>
              <div>
                <p className="text-xs font-bold text-primary">Need medical words explained?</p>
                <p className="text-[11px] text-on-surface-variant">Tap our word explainer or chat with our nurse anytime.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowGlossaryModal(true)}
              className="px-3 py-1.5 bg-white text-primary text-xs font-bold rounded-lg border border-primary/20 shadow-2xs hover:bg-primary/5 cursor-pointer shrink-0"
            >
              See Words
            </button>
          </div>

          {/* Divider */}
          <div className="h-px bg-outline-variant/20 mx-5 my-6" />

          {/* Up Next */}
          {mod.nextModule && (
            <div className="px-5 pb-6 space-y-3">
              <h3 className="font-headline-md text-on-surface text-base">Up Next</h3>
              <button
                type="button"
                onClick={() => navigate(`/education/${mod.nextModule.id}`)}
                className="w-full flex items-center gap-4 p-4 bg-surface-container-lowest rounded-xl organic-shadow hover:shadow-md transition-shadow active:scale-[0.99] text-left cursor-pointer"
              >
                <div className={`w-12 h-12 ${typeColors[mod.nextModule.type]?.bg || 'bg-surface-container'} rounded-lg flex items-center justify-center flex-shrink-0`}>
                  <span className={`material-symbols-outlined ${typeColors[mod.nextModule.type]?.text || 'text-on-surface-variant'}`}>
                    {mod.nextModule.icon}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-on-surface text-sm leading-snug">{mod.nextModule.title}</p>
                  <p className="text-xs text-on-surface-variant">{mod.nextModule.type} · {mod.nextModule.duration}</p>
                </div>
                <span className="material-symbols-outlined text-outline-variant flex-shrink-0">chevron_right</span>
              </button>
            </div>
          )}

          {/* Source note */}
          <p className="px-5 py-6 text-center italic text-outline font-body-md text-xs">
            Content simplified for maternal health • 9Care AI v1.0
          </p>
        </div>

        {/* ── FLOATING WHATSAPP CONTACT WITH BUBBLE ── */}
        <WhatsAppContact
          // On videos the comments sit just below the video: no bubble, and the button on the right
          key={isVideo ? 'video' : 'other'}
          initialBubble={!isVideo}
          side={isVideo ? 'right' : 'left'}
          bubbleText="Question about this lesson? Chat with a Doctor 👋"
          customMessage={`Hello Doctor, I was reading the lesson on "${mod.title}" in 9Care and wanted to ask a question.`}
        />

        {/* ── STICKY COMPLETION FOOTER ── */}
        {!completed ? (
          <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[640px] bg-white/95 backdrop-blur-lg border-t border-outline-variant/20 px-5 py-4 flex gap-3 shadow-lg z-40">
            <button
              type="button"
              onClick={() => navigate('/education')}
              className="flex-1 py-3.5 font-bold text-primary border-2 border-primary/20 rounded-xl hover:bg-primary/5 transition-all active:scale-95 text-sm cursor-pointer"
            >
              Back to list
            </button>
            <button
              type="button"
              onClick={() => {
                setCompleted(true);
                markModuleComplete(id).catch(() => {});
              }}
              className="flex-[2] py-3.5 font-bold text-white bg-primary rounded-xl hover:opacity-95 shadow-md transition-all active:scale-95 flex items-center justify-center gap-2 text-sm cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                check_circle
              </span>
              Mark as complete
            </button>
          </div>
        ) : (
          <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[640px] bg-primary text-white px-5 py-5 rounded-t-3xl shadow-[0_-8px_30px_rgba(0,0,0,0.15)] animate-slide-up z-40">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="font-headline-md text-base font-bold">Module completed!</p>
                <p className="text-white/80 text-xs mt-0.5">You've earned +10 9Care Points for learning</p>
              </div>
              <span className="material-symbols-outlined text-4xl text-amber-300" style={{ fontVariationSettings: "'FILL' 1" }}>
                celebration
              </span>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => navigate('/education')}
                className="w-full py-3 bg-white text-primary font-bold rounded-xl hover:bg-amber-50 transition-colors text-sm cursor-pointer"
              >
                Back to All Modules
              </button>
            </div>
          </div>
        )}

        {/* ── MEDICAL GLOSSARY MODAL ── */}
        {showGlossaryModal && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in">
            <div className="bg-white w-full max-w-lg rounded-t-3xl sm:rounded-2xl shadow-2xl max-h-[85vh] flex flex-col overflow-hidden animate-slide-up">
              {/* Modal header */}
              <div className="px-5 py-4 border-b border-stone-200 flex items-center justify-between bg-surface-container-lowest">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center text-sm font-bold">
                    💡
                  </div>
                  <div>
                    <h3 className="font-headline-md text-sm font-bold text-stone-900">
                      Medical Words Made Simple
                    </h3>
                    <p className="text-[11px] text-stone-500">
                      Everyday translations for clinical pregnancy terms
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowGlossaryModal(false)}
                  className="w-8 h-8 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-600 flex items-center justify-center text-sm font-bold cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {/* Glossary list */}
              <div className="p-5 overflow-y-auto space-y-4 divide-y divide-stone-100 flex-1">
                {Object.entries(MEDICAL_GLOSSARY).map(([term, data], idx) => (
                  <div key={idx} className={idx > 0 ? 'pt-4' : ''}>
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-bold text-xs uppercase tracking-wide text-primary capitalize">
                        {term}
                      </span>
                      <span className="text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-full">
                        {data.simple}
                      </span>
                    </div>
                    <p className="text-xs text-stone-700 mt-1 leading-relaxed">
                      {data.definition}
                    </p>
                    {data.pidgin && (
                      <p className="text-[11px] text-stone-500 italic mt-1 bg-stone-50 p-2 rounded-lg border border-stone-200/60">
                        <strong className="text-stone-700 not-italic">🇳🇬 Pidgin:</strong> {data.pidgin}
                      </p>
                    )}
                  </div>
                ))}
              </div>

              {/* Modal footer */}
              <div className="p-4 bg-stone-50 border-t border-stone-200 flex items-center justify-between">
                <p className="text-[11px] text-stone-500">Still confused about any medical term?</p>
                <a
                  href={`https://wa.me/2348034027044?text=${encodeURIComponent('Hello Doctor, could you please explain a medical term from the app?')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3.5 py-2 bg-[#25D366] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs hover:opacity-95 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[15px]">chat</span>
                  Ask on WhatsApp
                </a>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default EducationDetail;
