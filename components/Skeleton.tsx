import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, ViewStyle } from 'react-native';

interface SkeletonProps {
    width?: number | string;
    height?: number;
    borderRadius?: number;
    style?: ViewStyle;
}

/**
 * Skeleton loading placeholder with shimmer animation
 */
export const Skeleton: React.FC<SkeletonProps> = ({
    width = '100%',
    height = 20,
    borderRadius = 8,
    style,
}) => {
    const shimmerAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        const animation = Animated.loop(
            Animated.sequence([
                Animated.timing(shimmerAnim, {
                    toValue: 1,
                    duration: 1000,
                    useNativeDriver: true,
                }),
                Animated.timing(shimmerAnim, {
                    toValue: 0,
                    duration: 1000,
                    useNativeDriver: true,
                }),
            ])
        );
        animation.start();
        return () => animation.stop();
    }, [shimmerAnim]);

    const opacity = shimmerAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0.3, 0.7],
    });

    return (
        <Animated.View
            style={[
                styles.skeleton,
                { width: width as any, height, borderRadius, opacity },
                style,
            ]}
        />
    );
};

/**
 * Skeleton card for stats
 */
export const SkeletonCard: React.FC<{ style?: ViewStyle }> = ({ style }) => (
    <View style={[styles.card, style]}>
        <Skeleton width={40} height={40} borderRadius={20} />
        <View style={styles.cardContent}>
            <Skeleton width={60} height={14} style={{ marginBottom: 8 }} />
            <Skeleton width={80} height={20} />
        </View>
    </View>
);

/**
 * Skeleton row for member list
 */
export const SkeletonRow: React.FC<{ style?: ViewStyle }> = ({ style }) => (
    <View style={[styles.row, style]}>
        <View style={styles.rowLeft}>
            <Skeleton width={36} height={36} borderRadius={18} />
            <Skeleton width={100} height={16} style={{ marginLeft: 12 }} />
        </View>
        <Skeleton width={60} height={16} />
    </View>
);

/**
 * Full dashboard skeleton layout
 */
export const DashboardSkeleton: React.FC = () => (
    <View style={styles.container}>
        {/* Stats Cards */}
        <View style={styles.statsGrid}>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
        </View>

        {/* Member Stats Header */}
        <View style={styles.sectionHeader}>
            <Skeleton width={120} height={18} />
        </View>

        {/* Member List */}
        <View style={styles.memberList}>
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
        </View>
    </View>
);

const styles = StyleSheet.create({
    skeleton: {
        backgroundColor: '#334155',
    },
    container: {
        padding: 16,
    },
    statsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
        marginBottom: 24,
    },
    card: {
        width: '47%',
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderRadius: 16,
        padding: 16,
        flexDirection: 'row',
        alignItems: 'center',
    },
    cardContent: {
        marginLeft: 12,
        flex: 1,
    },
    sectionHeader: {
        marginBottom: 16,
    },
    memberList: {
        gap: 12,
    },
    row: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderRadius: 12,
        padding: 14,
    },
    rowLeft: {
        flexDirection: 'row',
        alignItems: 'center',
    },
});

export default DashboardSkeleton;
