import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  Modal,
  Pressable,
  Text,
  TouchableOpacity,
  View,
  type LayoutRectangle,
  type View as RNView,
} from 'react-native';
import { IconSymbol } from '@/components/ui/icon-symbol';

export type CoachAnchor =
  | 'center'
  | 'top'
  | 'bottom'
  | 'topLeft'
  | 'topRight'
  | 'bottomLeft'
  | 'bottomRight'
  | 'right';

export type CoachStep = {
  key: string;
  title: string;
  body: string;
  targetRef?: React.RefObject<RNView | null>;
  anchor?: CoachAnchor; // fallback if ref not measurable
};

type Props = {
  storageKey: string; // e.g. tutorial:tab:proxy:v1
  steps: CoachStep[];
  enabled?: boolean;
};

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function anchorRect(anchor: CoachAnchor, screen: { w: number; h: number }): LayoutRectangle {
  const w = screen.w;
  const h = screen.h;
  const size = 54;
  switch (anchor) {
    case 'topLeft':
      return { x: 16, y: 60, width: size, height: size };
    case 'topRight':
      return { x: w - size - 16, y: 60, width: size, height: size };
    case 'bottomLeft':
      return { x: 16, y: h - size - 140, width: size, height: size };
    case 'bottomRight':
      return { x: w - size - 16, y: h - size - 140, width: size, height: size };
    case 'top':
      return { x: (w - 220) / 2, y: 70, width: 220, height: 46 };
    case 'bottom':
      return { x: (w - 240) / 2, y: h - 160, width: 240, height: 56 };
    case 'right':
      return { x: w - 84, y: h / 2 - 40, width: 64, height: 80 };
    case 'center':
    default:
      return { x: (w - 240) / 2, y: h / 2 - 80, width: 240, height: 160 };
  }
}

async function hasSeen(storageKey: string) {
  try {
    const v = await AsyncStorage.getItem(storageKey);
    return v === 'true';
  } catch {
    return false;
  }
}

async function markSeen(storageKey: string) {
  try {
    await AsyncStorage.setItem(storageKey, 'true');
  } catch {
    // ignore
  }
}

export function CoachMarks({ storageKey, steps, enabled = true }: Props) {
  const [visible, setVisible] = useState(false);
  const [idx, setIdx] = useState(0);
  const [rect, setRect] = useState<LayoutRectangle | null>(null);
  const measuringRef = useRef(false);

  const screen = useMemo(() => {
    const d = Dimensions.get('window');
    return { w: d.width || 390, h: d.height || 800 };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let mounted = true;
    hasSeen(storageKey).then((seen) => {
      if (!mounted) return;
      if (!seen && steps.length > 0) {
        setVisible(true);
        setIdx(0);
      }
    });
    return () => {
      mounted = false;
    };
  }, [enabled, storageKey, steps.length]);

  const step = steps[idx];

  useEffect(() => {
    if (!visible) return;
    if (!step) return;
    if (measuringRef.current) return;
    measuringRef.current = true;

    const fallback = anchorRect(step.anchor ?? 'center', screen);
    const ref = step.targetRef?.current as any;
    if (ref?.measureInWindow) {
      try {
        ref.measureInWindow((x: number, y: number, width: number, height: number) => {
          measuringRef.current = false;
          if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height)) {
            setRect(fallback);
            return;
          }
          setRect({ x, y, width, height });
        });
        return;
      } catch {
        // fall through
      }
    }
    measuringRef.current = false;
    setRect(fallback);
  }, [visible, idx, step?.key]);

  if (!enabled || steps.length === 0) return null;

  const highlight = rect ?? anchorRect(step?.anchor ?? 'center', screen);
  const pad = 10;
  const hx = clamp(highlight.x - pad, 10, screen.w - 10);
  const hy = clamp(highlight.y - pad, 10, screen.h - 10);
  const hw = clamp(highlight.width + pad * 2, 44, screen.w - 20);
  const hh = clamp(highlight.height + pad * 2, 44, screen.h - 20);

  const bubbleWidth = Math.min(320, screen.w - 32);
  const bubbleX = clamp(hx + hw / 2 - bubbleWidth / 2, 16, screen.w - bubbleWidth - 16);
  const preferAbove = hy > screen.h * 0.55;
  const bubbleY = clamp(preferAbove ? hy - 150 : hy + hh + 12, 16, screen.h - 190);

  const close = async () => {
    setVisible(false);
    await markSeen(storageKey);
  };

  const next = async () => {
    if (idx < steps.length - 1) {
      setIdx((v) => v + 1);
    } else {
      await close();
    }
  };

  const back = () => setIdx((v) => Math.max(0, v - 1));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }}>
        <Pressable style={{ flex: 1 }} onPress={next} />

        {/* Highlight box */}
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: hx,
            top: hy,
            width: hw,
            height: hh,
            borderRadius: 16,
            borderWidth: 2,
            borderColor: 'rgba(255,255,255,0.92)',
            backgroundColor: 'rgba(255,255,255,0.06)',
          }}
        />

        {/* Bubble */}
        <View
          style={{
            position: 'absolute',
            left: bubbleX,
            top: bubbleY,
            width: bubbleWidth,
            borderRadius: 18,
            padding: 14,
            backgroundColor: 'rgba(255,255,255,0.96)',
            borderWidth: 1,
            borderColor: 'rgba(0,0,0,0.06)',
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 14, fontWeight: '800', color: '#0F172A' }}>{step.title}</Text>
            <TouchableOpacity onPress={close} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <IconSymbol name="xmark" size={16} color="#64748B" />
            </TouchableOpacity>
          </View>
          <Text style={{ marginTop: 8, fontSize: 12, lineHeight: 17, color: '#475569' }}>{step.body}</Text>

          <View style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <TouchableOpacity onPress={close} style={{ paddingVertical: 8, paddingHorizontal: 10 }}>
              <Text style={{ fontSize: 12, fontWeight: '800', color: '#64748B' }}>Skip</Text>
            </TouchableOpacity>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              {idx > 0 ? (
                <TouchableOpacity onPress={back} style={{ paddingVertical: 8, paddingHorizontal: 10 }}>
                  <Text style={{ fontSize: 12, fontWeight: '800', color: '#64748B' }}>Back</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                onPress={next}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  borderRadius: 12,
                  backgroundColor: '#0B1220',
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: '800', color: 'white' }}>
                  {idx === steps.length - 1 ? 'Done' : 'Next'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

