import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useRef } from 'react';
import { FlatList, Text, View } from 'react-native';

type WheelColumnProps = {
  label: string;
  value: number;
  onChange: (value: number) => void;
  scrollKey?: number;
  data?: number[];
};

const ITEM_HEIGHT = 38;
const VISIBLE_ITEMS = 3;
const CONTAINER_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS;
const CENTER_PADDING = ITEM_HEIGHT * Math.floor(VISIBLE_ITEMS / 2);

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function WheelColumn({ label, value, onChange, scrollKey, data: customData }: WheelColumnProps) {
  const data = useMemo(() => customData || Array.from({ length: 60 }, (_, i) => i), [customData]);
  const ref = useRef<FlatList<number> | null>(null);

  useEffect(() => {
    // When the modal opens (or caller bumps scrollKey), snap to current value.
    if (scrollKey === undefined) return;
    // Find closest value in data array (for minutes, snap to nearest 15/30/45)
    let targetValue = value;
    if (customData && customData.length > 0) {
      const closest = customData.reduce((prev, curr) => 
        Math.abs(curr - value) < Math.abs(prev - value) ? curr : prev
      );
      targetValue = closest;
    }
    const idx = data.findIndex((d) => d === targetValue);
    const finalIdx = idx >= 0 ? idx : clamp(Math.round(value), 0, data.length - 1);
    // small delay helps avoid "scrollToOffset called before mount" on some devices
    const t = setTimeout(() => {
      ref.current?.scrollToOffset({ offset: finalIdx * ITEM_HEIGHT, animated: false });
    }, 50);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollKey]);

  return (
    <View style={{ flex: 1 }}>
      <Text
        style={{
          fontSize: 12,
          color: '#6B7280',
          fontWeight: '600',
          textAlign: 'center',
          marginBottom: 10,
        }}
      >
        {label}
      </Text>

      <View
        style={{
          height: CONTAINER_HEIGHT,
          overflow: 'hidden',
          borderRadius: 18,
          borderWidth: 1,
          borderColor: 'rgba(148,163,184,0.25)',
          backgroundColor: 'rgba(255,255,255,0.55)',
        }}
      >
        {/* subtle fade/blur at top & bottom (tapering focus) */}
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: ITEM_HEIGHT,
            zIndex: 3,
            overflow: 'hidden',
          }}
        >
          <BlurView intensity={10} tint="light" style={{ flex: 1 }} />
          <LinearGradient
            colors={['rgba(255,255,255,0.65)', 'rgba(255,255,255,0.0)']}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          />
        </View>
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: ITEM_HEIGHT,
            zIndex: 3,
            overflow: 'hidden',
          }}
        >
          <BlurView intensity={3} tint="light" style={{ flex: 1 }} />
          <LinearGradient
            colors={['rgba(255,255,255,0.0)', 'rgba(255,255,255,0.65)']}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          />
        </View>


        <FlatList
          ref={(r) => {
            ref.current = r;
          }}
          data={data}
          keyExtractor={(n) => `${label}-${n}`}
          showsVerticalScrollIndicator={false}
          snapToInterval={ITEM_HEIGHT}
          decelerationRate="fast"
          getItemLayout={(_, index) => ({
            length: ITEM_HEIGHT,
            offset: ITEM_HEIGHT * index,
            index,
          })}
          contentContainerStyle={{
            paddingVertical: CENTER_PADDING,
          }}
          onMomentumScrollEnd={(e) => {
            const idx = clamp(Math.round(e.nativeEvent.contentOffset.y / ITEM_HEIGHT), 0, data.length - 1);
            onChange(data[idx]);
          }}
          renderItem={({ item }) => {
            const selected = item === value;
            return (
              <View
                style={{
                  height: ITEM_HEIGHT,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text
                  style={{
                    fontSize: selected ? 22 : 18,
                    fontWeight: selected ? '700' : '500',
                    color: selected ? '#0F172A' : 'rgba(15,23,42,0.30)',
                  }}
                >
                  {item}
                </Text>
              </View>
            );
          }}
        />
      </View>
    </View>
  );
}

export function DurationWheelPicker({
  days,
  hours,
  minutes,
  onDaysChange,
  onHoursChange,
  onMinutesChange,
  scrollKey,
}: {
  days: number;
  hours: number;
  minutes: number;
  onDaysChange: (v: number) => void;
  onHoursChange: (v: number) => void;
  onMinutesChange: (v: number) => void;
  scrollKey?: number;
}) {
  return (
    <View style={{ flexDirection: 'row', gap: 12 }}>
      <WheelColumn label="Days" value={days} onChange={onDaysChange} scrollKey={scrollKey} data={[0, 1, 2, 3, 4, 5, 6, 7]} />
      <WheelColumn label="Hours" value={hours} onChange={onHoursChange} scrollKey={scrollKey} />
      <WheelColumn label="Minutes" value={minutes} onChange={onMinutesChange} scrollKey={scrollKey} data={[0, 15, 30, 45]} />
    </View>
  );
}
