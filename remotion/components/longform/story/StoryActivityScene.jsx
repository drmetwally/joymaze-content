import { AbsoluteFill } from 'remotion';
import { ActivityChallenge } from '../../ActivityChallenge/ActivityChallenge.jsx';

const PILL_BG = 'rgba(255,210,0,0.93)';
const PILL_TEXT = '#1a1a1a';
const PILL_RX = 22;
const FONT_FAMILY = 'Nunito, Fredoka One, sans-serif';

const loadActivityData = (activityFolder) => {
  if (!activityFolder || typeof window !== 'undefined') {
    return null;
  }

  try {
    const requireFn = eval('require');
    const fs = requireFn('fs');
    const path = requireFn('path');
    const rootFolder = process.cwd();
    const folderPath = path.isAbsolute(activityFolder)
      ? activityFolder
      : path.join(rootFolder, activityFolder);
    const activityPath = path.join(folderPath, 'activity.json');
    const raw = fs.readFileSync(activityPath, 'utf-8');
    const data = JSON.parse(raw);
    return {
      ...data,
      imagePath: data.imagePath
        ? path.join(folderPath, data.imagePath).replace(/\\/g, '/')
        : path.join(folderPath, 'puzzle.png').replace(/\\/g, '/'),
    };
  } catch {
    return null;
  }
};

const PlaceholderCard = ({ text }) => (
  <AbsoluteFill
    style={{
      background: 'linear-gradient(180deg, #fff3c3 0%, #ffe08b 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '0 64px',
    }}
  >
    <div
      style={{
        backgroundColor: PILL_BG,
        borderRadius: PILL_RX,
        padding: '28px 34px',
        maxWidth: '90%',
      }}
    >
      <p
        style={{
          margin: 0,
          color: PILL_TEXT,
          fontFamily: FONT_FAMILY,
          fontSize: 48,
          fontWeight: 800,
          textAlign: 'center',
          lineHeight: 1.18,
        }}
      >
        {text}
      </p>
    </div>
  </AbsoluteFill>
);

export const StoryActivityScene = ({
  activityFolder = '',
  countdownSec = 60,
  hookText = 'Can your kid solve this?',
}) => {
  if (!activityFolder) {
    return <PlaceholderCard text="Activity coming soon" />;
  }

  const activityData = loadActivityData(activityFolder);
  if (!activityData) {
    return <PlaceholderCard text="Activity coming soon" />;
  }

  return (
    <ActivityChallenge
      {...activityData}
      countdownSec={activityData.countdownSec ?? countdownSec}
      hookText={activityData.hookText ?? hookText}
    />
  );
};
