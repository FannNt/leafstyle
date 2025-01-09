import { collection, doc, getDoc, getDocs, query, orderBy, limit, where, addDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db, auth } from "@/lib/firebase/config";
import { toast } from 'react-toastify';

export interface PointTransaction {
  id: string;
  userId: string;
  userName: string;
  points: number;
  reason: string;
  timestamp: string;
  type: 'POST_REWARD' | 'EVENT_ATTENDANCE' | 'MARKETPLACE_SALE' | 'SCAN_RECYCLABLE_ITEM' | 'OTHER';
}

export interface UserPoints {
  userId: string;
  userName: string;
  totalPoints: number;
  lastUpdated: string;
  lastScanDate?: string;
  dailyScanCount?: number;
}

class PointService {
  async addPoints(
    points: number, 
    reason: string, 
    type: PointTransaction['type'] = 'OTHER',
    targetUserId?: string
  ): Promise<void> {
    const userId = targetUserId || auth.currentUser?.uid;
    if (!userId) throw new Error("User not authenticated");

    try {
      await this.updateStreak(userId);
      
      const userRef = doc(db, "users", userId);
      const userDoc = await getDoc(userRef);
      
      if (!userDoc.exists()) throw new Error("User not found");
      
      const userData = userDoc.data();
      const currentPoints = userData.points || 0;
      const userName = userData.name || "Anonymous";

      // Create point transaction record
      await addDoc(collection(db, "pointTransactions"), {
        userId,
        userName,
        points,
        reason,
        type,
        timestamp: new Date().toISOString()
      });

      // Update user's total points
      await updateDoc(userRef, {
        points: currentPoints + points,
        lastUpdated: serverTimestamp()
      });

      toast.success(`+${points} poin ditambahkan! 🌟`, {
        style: {
          background: "linear-gradient(to right, #22c55e, #16a34a)",
          color: "white",
          borderRadius: "1rem",
        }
      });
    } catch (error) {
      console.error("Error adding points:", error);
      toast.error('Gagal menambahkan poin', {
        icon: "❌",
        style: {
          background: "linear-gradient(to right, #ef4444, #dc2626)",
          color: "white",
          borderRadius: "1rem",
        }
      });
      throw error;
    }
  }

  async getRemainingDailyScans(): Promise<number> {
    if (!auth.currentUser) throw new Error("User not authenticated");

    try {
      const userDoc = await getDoc(doc(db, "users", auth.currentUser.uid));
      if (!userDoc.exists()) throw new Error("User not found");

      const userData = userDoc.data();
      const today = new Date().toISOString().split('T')[0];
      const scanLimit = userData.dailyScanLimit || 2;

      if (userData.lastScanDate !== today) {
        return scanLimit;
      }

      return Math.max(0, scanLimit - (userData.dailyScanCount || 0));
    } catch (error) {
      console.error("Error checking remaining scans:", error);
      toast.error("Failed to check remaining scans. Please try again.", {
        icon: "❌",
        style: {
          background: "linear-gradient(to right, #ef4444, #dc2626)",
          color: "white",
        }
      });
      throw error;
    }
  }

  async getUserPointHistory(userId?: string): Promise<PointTransaction[]> {
    const targetUserId = userId || auth.currentUser?.uid;
    if (!targetUserId) throw new Error("User ID not provided");

    try {
      const q = query(
        collection(db, "pointTransactions"),
        where("userId", "==", targetUserId),
        orderBy("timestamp", "desc")
      );

      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as PointTransaction[];
    } catch (error) {
      console.error("Error fetching point history:", error);
      toast.error("Failed to fetch point history. Please try again.", {
        icon: "❌",
        style: {
          background: "linear-gradient(to right, #ef4444, #dc2626)",
          color: "white",
        }
      });
      throw error;
    }
  }

  async getLeaderboard(limitCount: number = 10): Promise<UserPoints[]> {
    try {
      const usersQuery = query(
        collection(db, "users"),
        orderBy("points", "desc"),
        limit(limitCount)
      );

      const snapshot = await getDocs(usersQuery);
      return snapshot.docs.map(doc => ({
        userId: doc.id,
        userName: doc.data().name || "Anonymous",
        totalPoints: doc.data().points || 0,
        lastUpdated: doc.data().lastUpdated?.toDate?.().toISOString() || new Date().toISOString()
      }));
    } catch (error) {
      console.error("Error fetching leaderboard:", error);
      toast.error("Failed to fetch leaderboard. Please try again.", {
        icon: "❌",
        style: {
          background: "linear-gradient(to right, #ef4444, #dc2626)",
          color: "white",
        }
      });
      throw error;
    }
  }

  async getUserPoints(userId?: string): Promise<number> {
    try {
      const targetUserId = userId || auth.currentUser?.uid;
      if (!targetUserId) throw new Error("User ID not provided");

      const userRef = doc(db, "users", targetUserId);
      const userDoc = await getDoc(userRef);
      
      if (!userDoc.exists()) {
        return 0;
      }
      
      return userDoc.data().points || 0;
    } catch (error) {
      console.error("Error fetching user points:", error);
      toast.error("Failed to fetch user points. Please try again.", {
        icon: "❌",
        style: {
          background: "linear-gradient(to right, #ef4444, #dc2626)",
          color: "white",
        }
      });
      throw error;
    }
  }

  async getUserStreak(userId?: string): Promise<number> {
    const targetUserId = userId || auth.currentUser?.uid;
    if (!targetUserId) throw new Error("User ID not provided");

    try {
      const userDoc = await getDoc(doc(db, "users", targetUserId));
      if (!userDoc.exists()) throw new Error("User not found");
      return userDoc.data().streak || 0;
    } catch (error) {
      console.error("Error fetching user streak:", error);
      toast.error("Failed to fetch user streak. Please try again.", {
        icon: "❌",
        style: {
          background: "linear-gradient(to right, #ef4444, #dc2626)",
          color: "white",
        }
      });
      throw error;
    }
  }

  async updateStreak(userId?: string): Promise<void> {
    try {
      const targetUserId = userId || auth.currentUser?.uid;
      if (!targetUserId) throw new Error("User ID not provided");

      const userRef = doc(db, "users", targetUserId);
      const userDoc = await getDoc(userRef);
      
      if (!userDoc.exists()) return;
      
      const userData = userDoc.data();
      const lastActivityDate = userData.lastActivityDate?.toDate() || new Date(0);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const lastDate = new Date(lastActivityDate);
      lastDate.setHours(0, 0, 0, 0);
      
      const diffDays = Math.floor((today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
      
      let newStreak = userData.streak || 0;
      
      if (diffDays === 1) {
        newStreak += 1;
      } else if (diffDays > 1) {
        newStreak = 1;
      } else if (diffDays === 0) {
        return;
      }
      
      await updateDoc(userRef, {
        streak: newStreak,
        lastActivityDate: serverTimestamp()
      });
    } catch (error) {
      console.error("Error updating streak:", error);
      toast.error("Failed to update streak. Please try again.", {
        icon: "❌",
        style: {
          background: "linear-gradient(to right, #ef4444, #dc2626)",
          color: "white",
        }
      });
      throw error;
    }
  }
}

const pointService = new PointService();
export default pointService; 