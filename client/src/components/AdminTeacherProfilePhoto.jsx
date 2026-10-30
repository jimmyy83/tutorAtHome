import { useEffect, useRef, useState } from 'react';
import { getTeacherProfilePhoto, revokeTeacherProfilePhoto, teacherProfilePhotoCacheKey } from '../utils/teacherProfilePhotoCache.js';
import { shouldLoadTeacherProfilePhoto } from '../utils/adminTeacherProfilePhoto.js';

export default function AdminTeacherProfilePhoto({ row, token, cache, requests, api, publicPhoto = '' }) {
  const containerRef = useRef(null);
  const [nearViewport, setNearViewport] = useState(false);
  const [privateImage, setPrivateImage] = useState(() => ({
    key: teacherProfilePhotoCacheKey(row.id, row.profilePhotoVersion),
    url: cache.get(teacherProfilePhotoCacheKey(row.id, row.profilePhotoVersion)) || '',
  }));
  const [privateFailed, setPrivateFailed] = useState(false);
  const [publicFailed, setPublicFailed] = useState(false);
  const version = String(row.profilePhotoVersion || '');
  const key = teacherProfilePhotoCacheKey(row.id, version);
  const privateUrl = privateImage.key === key ? privateImage.url : cache.get(key) || '';
  const hasPrivatePhoto = Boolean(row.hasProfilePhoto && version);

  useEffect(() => {
    setPrivateImage({ key, url: cache.get(key) || '' });
    setPrivateFailed(false);
  }, [key, cache]);
  useEffect(() => setPublicFailed(false), [publicPhoto]);

  useEffect(() => {
    if (!hasPrivatePhoto || privateUrl || privateFailed) return undefined;
    const target = containerRef.current;
    if (!target || typeof IntersectionObserver === 'undefined') {
      setNearViewport(true);
      return undefined;
    }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        setNearViewport(true);
        observer.disconnect();
      }
    }, { rootMargin: '180px 0px' });
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasPrivatePhoto, privateUrl, privateFailed, key]);

  useEffect(() => {
    if (!shouldLoadTeacherProfilePhoto({ nearViewport, hasPhoto: hasPrivatePhoto, version, cached: Boolean(privateUrl), failed: privateFailed })) return undefined;
    let active = true;
    getTeacherProfilePhoto({ cache, requests, api, teacherId: row.id, version, authToken: token })
      .then(photo => { if (active) setPrivateImage({ key: photo.key, url: photo.url }); })
      .catch(() => { if (active) setPrivateFailed(true); });
    return () => { active = false; };
  }, [nearViewport, hasPrivatePhoto, version, privateUrl, privateFailed, cache, requests, api, row.id, token]);

  const photo = privateUrl || (!publicFailed ? publicPhoto : '');
  const loading = hasPrivatePhoto && !privateUrl && !privateFailed && !publicPhoto;
  const onImageError = event => {
    if (privateUrl && event.currentTarget.currentSrc === privateUrl) {
      revokeTeacherProfilePhoto(cache, key);
      setPrivateImage({ key, url: '' });
      setPrivateFailed(true);
      return;
    }
    setPublicFailed(true);
  };

  return <div ref={containerRef} className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-slate-100" aria-label={`${row.fullName} profile photo`}>
    {photo ? <img src={photo} alt={`${row.fullName} profile`} loading="lazy" width="56" height="56" className="h-full w-full object-cover" onError={onImageError}/> : <div className="grid h-full place-items-center p-1 text-center text-[10px] text-slate-400">{loading ? 'Loading photo…' : 'No photo'}</div>}
  </div>;
}
