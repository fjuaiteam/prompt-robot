/* ============================================================
   易學版 — 內容資料層
   ------------------------------------------------------------
   給心智障礙者自己操作（心智年齡大約 8 歲，大人小孩都有）。
   畫面上的字照衛福部社家署《臺灣易讀參考指南》：
     ・一句只說一件事，短句、常用字，不用比喻
     ・每個選項都有圖＋字
     ・口吻對大人說話，不用「乖」「棒棒」「小朋友」。
       小孩看這種口吻不會怪，大人看到哄小孩的口吻會覺得被看輕。

   要改字、加選項，只改這個檔，不用動 easy.js。

   pic：選項圖片的檔名（不含副檔名），放在 assets/easy/pics/，
        .png 或 .jpg 都可以。圖用的是 ARASAAC 圖卡（授權規定見那個資料夾裡的
        「圖片來源與授權.txt」，非商業使用、要標示來源）。
   photo：優先顯示的真人照片檔名（不含 .jpg）；找不到時退回 pic 圖卡。
          照片來源、作者與授權見 assets/easy/pics/真人照片來源與授權.txt。
   emo：找不到圖檔時的備用符號。正常情況看不到，是給「換了圖、檔名打錯」
        這種時候墊檔用的，畫面不會破。
   p  ：放進指令裡的那一段文字（給 AI 看的）。畫面上顯示的是 t。
   ============================================================ */

/* 拿去給哪一個 AI 畫。
   q：可以把指令直接帶進去的網址。ChatGPT 支援 ?q=，打開時框框裡就有指令，
      按送出就好。沒有這種網址的 AI（例如 Gemini）把 q 留空，只會打開網站，
      使用者要自己按右鍵貼上。 */
const EASY_AI = {
  name:'ChatGPT',
  url:'https://chatgpt.com/',
  q:'https://chatgpt.com/?q='
};

/* 指令裡每一段的分類。畫面上用顏色＋圖示＋名稱三個一起標，不只靠顏色。
   圖示是 easy.js 裡的 ICO_PART（跟工作人員版同一套 1.5 筆畫的線條圖示）。 */
const EASY_PARTS = {
  who  :{ t:'主角' },
  where:{ t:'地方' },
  what :{ t:'在做什麼' },
  feel :{ t:'心情' },
  look :{ t:'畫風' }
};

/* ---------- 做一張圖：九個問題，一個畫面問一個 ---------- */

const EASY_SEX = [
  { id:'m', t:'男生', emo:'👦', pic:'who-m', photo:'photo-boy' },
  { id:'f', t:'女生', emo:'👧', pic:'who-f', photo:'photo-girl' }
];

/* kind：決定畫風選項和「照真實比例畫」那條規則 */
const EASY_AGE = [
  { id:'kid',   t:'小孩',   sub:'國小',        emo:'🧒', pic:'age-kid', photo:'photo-boy',
    p:{ m:'大約 8 歲的男孩',        f:'大約 8 歲的女孩' },
    rule:'主角是小孩，照真實的小孩比例畫。' },
  { id:'teen',  t:'青少年', sub:'國中、高中',  emo:'🧑', pic:'age-teen', photo:'photo-teen',
    p:{ m:'大約 15 歲的男生',       f:'大約 15 歲的女生' },
    rule:'主角是青少年，照真實的青少年比例畫，不要畫成幼兒的樣子。' },
  { id:'adult', t:'大人',   sub:'20 到 59 歲', emo:'🧑‍💼', pic:'age-adult', photo:'photo-adult',
    p:{ m:'30 歲左右的成年男性',    f:'30 歲左右的成年女性' },
    rule:'主角是成年人，照真實的成人比例畫。不要畫成小孩或 Q 版，不要加紅臉頰、星星眼這類卡通符號。' },
  { id:'old',   t:'長輩',   sub:'60 歲以上',   emo:'🧓', pic:'age-old', photo:'photo-older',
    p:{ m:'70 歲左右的老先生',      f:'70 歲左右的老太太' },
    rule:'主角是長輩，照真實的長輩樣子與比例畫，臉上可以有一點皺紋。不要把長輩畫成幼兒或 Q 版人物。' }
];

/* {C} 會換成頭髮顏色：長輩是灰白色，其他是黑色 */
const EASY_HAIR = [
  { id:'short', t:'短頭髮', emo:'💇', pic:'hair-short', p:'{C}短頭髮' },
  { id:'long',  t:'長頭髮', emo:'💁', pic:'hair-long',  p:'{C}長頭髮，披在肩膀上' },
  { id:'tail',  t:'綁馬尾', emo:'🎀', pic:'hair-tail',  p:'{C}長頭髮，綁成一條馬尾' },
  { id:'curly', t:'捲頭髮', emo:'🌀', pic:'hair-curly', p:'{C}捲捲的短頭髮' }
];

/* 衣服顏色直接畫色塊，不用另外生圖。
   褲子固定深藍色，所以「藍」用淺藍，不然上下會黏成一塊。 */
const EASY_TOP = [
  { id:'red',    t:'紅色', hex:'#c8413a', p:'紅色' },
  { id:'yellow', t:'黃色', hex:'#e2b12a', p:'黃色' },
  { id:'green',  t:'綠色', hex:'#4f9a58', p:'綠色' },
  { id:'blue',   t:'藍色', hex:'#5b93c9', p:'淺藍色' }
];

/* 隨身的東西。輔具是主角外觀的一部分，每一張都要畫出來——
   這是工作人員版原則 2 在實務上最容易漏掉的地方，易學版直接放成一題。 */
const EASY_AID = [
  { id:'none',       t:'沒有',   none:true, p:'' },
  { id:'glasses',    t:'眼鏡',   emo:'👓', pic:'aid-glasses',
    p:'戴黑色細框眼鏡', name:'眼鏡' },
  { id:'wheelchair', t:'輪椅',   emo:'🦽', pic:'aid-wheelchair',
    p:'坐在深灰色的手動輪椅上（黑色椅背、銀色輪圈）', name:'輪椅' },
  // emoji 沒有助行器；🩼（拐杖）最接近。🦯 是視障者的白手杖，不能用
  { id:'walker',     t:'助行器', emo:'🩼', pic:'aid-walker',
    p:'雙手扶著銀色的四腳助行器', name:'助行器' }
];

/* 地方＋在這個地方可以做的事。
   wc：坐輪椅時換成這一句（例如「站著抓扶手」坐輪椅做不到）。 */
const EASY_PLACE = [
  { id:'home', t:'家裡', emo:'🏠', pic:'place-home', p:'家裡，乾淨整齊的居家環境', short:'家裡',
    acts:[
      { id:'brush', t:'刷牙',   emo:'🪥', pic:'act-home-brush', p:'在浴室的洗手台前刷牙，手上拿著牙刷' },
      { id:'eat',   t:'吃飯',   emo:'🍚', pic:'act-home-eat',   p:'坐在餐桌前，用筷子吃飯' },
      { id:'tv',    t:'看電視', emo:'📺', pic:'act-home-tv',    p:'坐在客廳的沙發上看電視',
        wc:'在客廳看電視' },
      { id:'dish',  t:'洗碗',   emo:'🍽️', pic:'act-home-dish',  p:'在廚房的水槽前洗碗' } ] },

  { id:'park', t:'公園', emo:'🌳', pic:'place-park', p:'公園，有綠色的草地和大樹', short:'公園',
    acts:[
      { id:'walk',    t:'散步',     emo:'🚶', pic:'act-park-walk',    p:'在步道上散步',
        wc:'坐在輪椅上，自己用手推著輪圈，在步道上散步' },
      { id:'rest',    t:'坐著休息', emo:'🪑', pic:'act-park-rest',    p:'坐在樹下的長椅上休息',
        wc:'在樹下休息' },
      { id:'stretch', t:'做運動',   emo:'🙆', pic:'act-park-stretch', p:'舉起雙手做伸展運動' },
      { id:'dog',     t:'摸狗狗',   emo:'🐕', pic:'act-park-dog',     p:'蹲下來摸一隻小狗',
        wc:'彎下身體摸一隻小狗' } ] },

  { id:'hosp', t:'醫院', emo:'🏥', pic:'place-hosp', p:'醫院，乾淨明亮', short:'醫院',
    acts:[
      { id:'reg',  t:'掛號',   emo:'🪪', pic:'act-hosp-reg',  p:'在掛號櫃檯，把健保卡交給櫃檯人員（櫃檯人員穿制服，沒有特定長相）' },
      { id:'wait', t:'等叫號', emo:'⏳', pic:'act-hosp-wait', p:'坐在候診區的椅子上等叫號',
        wc:'在候診區等叫號' },
      { id:'talk', t:'看醫生', emo:'🩺', pic:'act-hosp-talk', p:'在診間跟醫生說話（醫生穿白袍，識別證上沒有字）' },
      { id:'bp',   t:'量血壓', emo:'💪', pic:'act-hosp-bp',   p:'把手臂放進量血壓的機器裡量血壓' } ] },

  { id:'bus', t:'公車上', emo:'🚌', pic:'place-bus', p:'公車上', short:'公車上',
    acts:[
      { id:'card', t:'刷卡上車', emo:'💳', pic:'act-bus-card', p:'上車的時候，把卡片靠近刷卡機' },
      { id:'sit',  t:'坐在位子上', emo:'💺', pic:'act-bus-sit', p:'坐在靠窗的位子上',
        wc:'把輪椅停在公車的輪椅區' },
      { id:'bell', t:'按下車鈴', emo:'🔔', pic:'act-bus-bell', p:'伸手按下車鈴' },
      { id:'hold', t:'抓好扶手', emo:'✊', pic:'act-bus-hold', p:'站著，手抓好扶手',
        wc:'坐在輪椅上，手抓好旁邊的扶手' } ] },

  { id:'food', t:'餐廳', emo:'🍜', pic:'place-food', p:'餐廳，明亮乾淨', short:'餐廳',
    acts:[
      { id:'menu', t:'點餐',       emo:'📋', pic:'act-food-menu', p:'看著菜單，用手指著想吃的東西點餐' },
      { id:'eat',  t:'吃飯',       emo:'🍛', pic:'act-food-eat',  p:'坐在桌子前吃飯' },
      { id:'pay',  t:'付錢',       emo:'💰', pic:'act-food-pay',  p:'在櫃檯把錢交給店員' },
      { id:'chat', t:'跟朋友聊天', emo:'💬', pic:'act-food-chat', p:'跟一個朋友坐在一起聊天，兩個人都在笑' } ] },

  { id:'mart', t:'超市', emo:'🛒', pic:'place-mart', p:'超市，貨架整齊', short:'超市',
    acts:[
      { id:'cart', t:'推購物車', emo:'🛒', pic:'act-mart-cart', p:'推著購物車',
        wc:'坐在輪椅上，腿上放著購物籃' },
      { id:'pick', t:'拿東西',   emo:'🥛', pic:'act-mart-pick', p:'伸手從貨架上拿一瓶牛奶' },
      { id:'line', t:'排隊結帳', emo:'🧍', pic:'act-mart-line', p:'拿著購物籃排隊結帳' },
      { id:'pay',  t:'付錢',     emo:'💵', pic:'act-mart-pay',  p:'在收銀台把錢交給店員' } ] }
];

/* 心情：寫成看得見的臉和動作（原則 1），不是只有一個形容詞 */
const EASY_MOOD = [
  { id:'happy',   t:'開心', emo:'😊', pic:'mood-happy',   p:'開心，臉上在微笑，看起來很輕鬆' },
  { id:'nervous', t:'緊張', emo:'😬', pic:'mood-nervous', p:'有一點緊張，眉頭微微皺起來，兩隻手握在一起' },
  { id:'sad',     t:'難過', emo:'😢', pic:'mood-sad',     p:'難過，嘴角往下，眼睛看著下面' },
  { id:'angry',   t:'生氣', emo:'😠', pic:'mood-angry',   p:'生氣，眉頭皺起來，嘴巴抿緊（不要畫得可怕）' }
];

/* 四種畫風都可選，人物年齡與比例仍由 EASY_AGE 的規則決定。
   改寫自工作人員版的 STYLE_PRESETS，但拿掉主色：
   一張圖的顏色由主角的衣服決定，再給主色會打架（例如印章風只准兩個顏色）。
   畫材與筆觸不等於人物年齡，不要求把成年人畫成幼兒。 */
const EASY_STYLE = [
  { id:'crayon',  t:'蠟筆畫', emo:'🖍️', pic:'style-crayon',
    p:'柔和蠟筆／色鉛筆插畫，低飽和、少線條、不過度精緻，米白色紙紋背景；看得出蠟筆顆粒與筆觸，人物照所選年齡與真實比例畫' },
  { id:'cartoon', t:'卡通畫', emo:'✏️', pic:'style-cartoon',
    p:'卡通風格的插畫：深色輪廓線明確、粗細一致，色塊填滿不做漸層，比例不變形；中飽和、不要螢光色，米白色紙紋背景' },
  { id:'line',    t:'線條畫', emo:'🖊️', pic:'style-line',
    p:'清晰的線條插畫，低飽和、背景乾淨、沒有多餘裝飾，米白色紙紋背景' },
  { id:'water',   t:'水彩畫', emo:'🎨', pic:'style-water',
    p:'淡水彩插畫：邊緣柔和有暈染，顏色透明疊加不厚塗，留白多，不要濃重的黑色描邊；低飽和、米白色紙紋背景' }
];

/* 選「其他」才顯示文字欄位，保留原本用圖卡選擇的操作。 */
const EASY_CUSTOM = {
  top:  {label:'主角穿什麼衣服？', example:'例如：白色長袖襯衫、黑色長褲、咖啡色皮鞋'},
  aid:  {label:'主角有用或戴什麼？', example:'例如：戴紅色帽子，背黑色背包'},
  place:{label:'主角在哪裡？',       example:'例如：圖書館，旁邊有書架'},
  act:  {label:'主角在做什麼？',     example:'例如：坐在桌子前看書'}
};
const EASY_CUSTOM_MAX = 160;

/* 九題的順序。part 決定題目的顏色和進度條分段；k 是摘要頁上的短名稱。 */
const EASY_QS = [
  { id:'sex',   part:'who',   k:'男生女生', q:'主角是男生，還是女生？' },
  { id:'age',   part:'who',   k:'年紀',     q:'主角是哪個年齡？' },
  { id:'hair',  part:'who',   k:'頭髮',     q:'頭髮長什麼樣子？' },
  { id:'top',   part:'who',   k:'衣服',     q:'主角穿什麼衣服？',
    hint:'選一個顏色，或選「其他」自己填衣服。' },
  { id:'aid',   part:'who',   k:'用的東西', q:'主角有用這些東西嗎？',
    hint:'沒有用，就選「沒有」。還有別的東西，可以選「其他」自己填。' },
  { id:'place', part:'where', k:'地方',     q:'主角在哪裡？',
    hint:'沒有想選的地方，可以選「其他」自己填。' },
  { id:'act',   part:'what',  k:'在做什麼', q:'主角在做什麼？',
    hint:'沒有想選的動作，可以選「其他」自己填。' },
  { id:'mood',  part:'feel',  k:'心情',     q:'主角的心情怎麼樣？' },
  { id:'style', part:'look',  k:'畫風',     q:'要畫成哪一種畫？', hint:'四種畫風，選一種就好。' }
];

/* ---------- 畫得不對：只改一件事 ----------
   這一步就是原則 3（一次只改一件事）和原則 4（畫錯了就整張重畫）。
   {HERO}{PLACE}{ACT} 會換成使用者選的內容。 */
const EASY_FIX = [
  { id:'person', t:'人不像我選的', emo:'🙅', pic:'fix-person',
    p:'請重新畫一張。\n只改一件事：主角要照這個樣子畫——\n{HERO}\n其他（地方、動作、心情、畫風）都跟上一張一樣，不要動。\n整張重新畫，不要在舊的圖上修改。' },
  { id:'extra',  t:'多了奇怪的東西', emo:'❓', pic:'fix-extra',
    p:'請重新畫一張。\n只改一件事：畫面裡只要主角和{PLACE}，不要多加別的人、動物或東西。\n其他都跟上一張一樣，不要動。\n整張重新畫，不要用色塊蓋掉。' },
  { id:'text',   t:'圖上有字', emo:'🔤', pic:'fix-text',
    p:'請重新畫一張。\n只改一件事：整張圖不要有任何字、數字、招牌字或標誌。\n其他都跟上一張一樣，不要動。\n整張重新畫，不要用色塊蓋掉字。' },
  { id:'body',   t:'手或臉怪怪的', emo:'✋', pic:'fix-body',
    p:'請重新畫一張。\n只改一件事：主角的臉要自然，兩隻手都要完整，每隻手有五根手指。\n其他都跟上一張一樣，不要動。\n整張重新畫，不要在舊的圖上修改。' },
  { id:'act',    t:'動作不對', emo:'🔄', pic:'fix-act',
    p:'請重新畫一張。\n只改一件事：主角要{ACT}。\n其他都跟上一張一樣，不要動。\n整張重新畫，不要在舊的圖上修改。' },
  { id:'cut',    t:'人被切掉了', emo:'✂️', pic:'fix-cut',
    p:'請重新畫一張。\n只改一件事：畫面拉遠一點，主角的全身都要在圖裡，頭和腳都不要被切掉。\n其他都跟上一張一樣，不要動。\n整張重新畫，不要在舊的圖上修改。' }
];

/* ---------- 畫面上的字 ---------- */
const EASY_UI = {
  mark:'提示詞機器人',
  modeName:'易學版',
  homeTitle:'你想做什麼？\n選一個開始。',
  docCard:{ t:'讀懂一份文件', d:'選文件，請 ChatGPT 改成易讀文字。' },
  picCard:{ t:'開始畫一張圖片', d:'先選主角，再選地方和動作。' },
  picResume:{ t:'繼續畫剛剛的圖片', d:'你還沒有完成。\n按這裡，繼續畫圖片。' },
  picDone:{ t:'剛剛的圖片完成了', d:'按這裡，可以用同一個主角再畫一張。' },
  picRestart:'重新畫一張圖片',

  stages:['選一選','看指令','請 AI 畫','看圖'],

  sumTitle:'你選的是這些',
  sumSub:'想改哪一個，就按「改」。',
  promptTitle:'這是你的指令',
  promptLines:['你選的內容，已經寫成指令了。','同一類的內容，用同一種顏色標示。'],
  // 瀏覽器分頁上的名字。第 3 步要他按這個分頁回來，所以要短、要好認
  tabTitle:'易學版｜提示詞機器人',
  giveTitle:'請 AI 畫圖片',
  giveLead:'先看完這三步，再按按鈕。',
  giveBtn:'把提示詞帶到 ' + EASY_AI.name,
  giveOnly:'只複製指令',
  give1:'按下面的按鈕。系統會先複製提示詞，再打開 ' + EASY_AI.name + '，並嘗試把提示詞放進輸入框。',
  give2:EASY_AI.name + ' 打開以後：',
  giveHas:'輸入框裡有指令：按送出。',
  giveEmpty:'輸入框是空的：在框裡按右鍵，選「貼上」，再按送出。',
  give3:'等圖片畫好，按瀏覽器上方的「易學版」分頁，回到這裡。',
  checkTitle:'圖畫得對嗎？',
  checkSub:'看看 AI 的圖片。主角、地方和動作，跟你選的一樣嗎？',
  checkOk:'對，畫得很好',
  checkBad:'不對，要改',
  doneTitle:'完成了！',
  doneLines:['圖片完成了。','想存下圖片：回到 ' + EASY_AI.name + '，在圖片上按右鍵，選「另存圖片」。'],
  doneSame:'用同一個主角，再畫一張',
  doneNew:'全部重新選',
  fixPickTitle:'哪裡不對？',
  fixPickSub:'選一個就好。一次只改一件事。',
  fixTitle:'只改這一件事',
  fixLines:['請 AI 改好你選的問題，再畫一張。','其他內容保持一樣。'],
  fixSteps:['回到 ' + EASY_AI.name + ' 剛剛的對話。','在輸入框貼上修改指令，再按送出。'],
  fixCopy:'複製修改指令',

  needPick:'請先選一個。',
  copied:'指令複製好了',

  // 圖片授權要求標示來源，所以固定放在首頁最下面。
  // 詳細條款見 assets\easy\pics\圖片來源與授權.txt
  photoCredit:'人物照片：Pexels・來源與授權',
  photoCreditUrl:'assets/easy/pics/真人照片來源與授權.txt',
  credit:'其他圖卡：Sergio Palao／ARASAAC（CC BY-NC-SA）・西班牙亞拉岡自治區政府',
  creditUrl:'https://arasaac.org',

  toPro:'工作人員版',
  toEngineer:'工程模式',
  toEngineerQ:'這是給工作人員管理圖卡用的。\n要進入工程模式嗎？',
  toEngineerNo:'不要，留在這裡',
  toEngineerYes:'進入工程模式',
  toProQ:'這是給工作人員用的。\n要換過去嗎？',
  toProNo:'不要，留在這裡',
  toProYes:'換到工作人員版',
  nextOne:'換下一位',
  nextOneQ:'要清掉剛剛選的東西嗎？\n下一位就可以重新開始。',
  nextOneNo:'不要',
  nextOneYes:'清掉',
  cleared:'清好了，下一位可以開始了'
};
