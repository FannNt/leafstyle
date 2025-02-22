import { FirebaseError } from "firebase/app";
import { auth, db } from "@/lib/firebase/config";
import { doc, setDoc, serverTimestamp, getDoc } from "firebase/firestore";
import { createUserWithEmailAndPassword, GoogleAuthProvider, signInWithEmailAndPassword, signInWithPopup, UserCredential } from "firebase/auth";
import Cookies from "js-cookie";
import { signOut } from "@firebase/auth";

export default async function saveCookie(userCredential: UserCredential) {
  Cookies.set("user", JSON.stringify(await userCredential.user.getIdToken()), {
    expires: 1,
    sameSite: 'lax',
    path: '/',
  });
}

// Helper function to translate Firebase errors to user-friendly messages
const getErrorMessage = (errorCode: string) => {
  const errorMessages: { [key: string]: string } = {
    "auth/email-already-in-use": "Email sudah terdaftar. Silakan gunakan email lain.",
    "auth/invalid-email": "Format email tidak valid.",
    "auth/weak-password": "Kata sandi terlalu lemah. Gunakan kombinasi huruf, angka, dan simbol.",
    "auth/user-not-found": "Pengguna tidak ditemukan. Periksa kembali email Anda.",
    "auth/wrong-password": "Kata sandi salah. Silakan coba lagi.",
    "auth/network-request-failed": "Gagal terhubung ke server. Periksa koneksi internet Anda.",
    default: "Terjadi kesalahan. Silakan coba lagi nanti.",
  };

  return errorMessages[errorCode] || errorMessages.default;
};

export const signUpUser = async (email: string, password: string, name: string) => {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const userRef = doc(db, "users", userCredential.user.uid);

    await setDoc(userRef, {
      name,
      points: 0,
      lastUpdated: serverTimestamp(),
      dailyScanLimit: 2,
      dailyScanCount: 0,
      lastScanDate: null
    });

    await saveCookie(userCredential);
    return userCredential.user;

  } catch (error: unknown) {
    if (error instanceof FirebaseError) {
      throw new Error(getErrorMessage(error.code));
    }
    throw new Error("Terjadi kesalahan yang tidak diketahui.");
  }
};

export const loginUser = async (email: string, password: string) => {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    await saveCookie(userCredential);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const isAdmin = await checkAndSetAdminStatus(userCredential.user.uid);
    return userCredential.user;
  } catch (error) {
    if (error instanceof FirebaseError) {
      throw new Error(getErrorMessage(error.code));
    }
    throw new Error("Terjadi kesalahan yang tidak diketahui.");
  }
};

export const logoutUser = async () => {
  try {
    Cookies.remove('user');
    Cookies.remove('isAdmin');
    await signOut(auth);
  } catch {
    throw new Error("Gagal keluar. Silakan coba lagi nanti.");
  }
};

export const signInWithGoogle = async () => {
  try {
    const provider = new GoogleAuthProvider();
    const userCredential = await signInWithPopup(auth, provider);
    
    // Check if user document exists
    const userRef = doc(db, "users", userCredential.user.uid);
    
    // Create user document if it doesn't exist
    await setDoc(userRef, {
      name: userCredential.user.displayName || "User",
      phoneNumber: 0,
      points: 0,
      lastUpdated: serverTimestamp(),
    }, { merge: true });
    
    await saveCookie(userCredential);
    return userCredential.user;
  } catch (error) {
    if (error instanceof FirebaseError) {
      throw new Error(getErrorMessage(error.code));
    }
    throw new Error("Terjadi kesalahan yang tidak diketahui.");
  }
};

export const checkAndSetAdminStatus = async (uid: string) => {
  try {
    const userDoc = await getDoc(doc(db, 'users', uid));
    const isAdmin = userDoc.data()?.isAdmin === true;
    console.log('Setting admin status:', isAdmin);
    
    if (isAdmin) {
      Cookies.set('isAdmin', 'true', {
        expires: 1,
        sameSite: 'lax',
        path: '/',
      });
      console.log('Admin cookie set:', Cookies.get('isAdmin'));
    }
    
    return isAdmin;
  } catch (error) {
    console.error('Error checking admin status:', error);
    return false;
  }
};