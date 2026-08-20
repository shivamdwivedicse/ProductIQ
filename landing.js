// scroll-reveal animation
const revealEls = document.querySelectorAll('.reveal');
const io = new IntersectionObserver((entries)=>{
  entries.forEach(entry=>{
    if (entry.isIntersecting){
      entry.target.classList.add('in');
      io.unobserve(entry.target);
    }
  });
}, { threshold: 0.15 });
revealEls.forEach(el=>io.observe(el));

// smooth scroll for in-page anchor links
document.querySelectorAll('a[href^="#"]').forEach(a=>{
  a.addEventListener('click', e=>{
    const target = document.querySelector(a.getAttribute('href'));
    if (target){
      e.preventDefault();
      target.scrollIntoView({behavior:'smooth', block:'start'});
    }
  });
});

// parallax drift on hero blobs following mouse
const blobs = document.querySelectorAll('.hero-blob');
document.addEventListener('mousemove', (e)=>{
  const x = (e.clientX / window.innerWidth - 0.5) * 24;
  const y = (e.clientY / window.innerHeight - 0.5) * 24;
  blobs.forEach((b,i)=>{
    const dir = i % 2 === 0 ? 1 : -1;
    b.style.transform = `translate(${x*dir}px, ${y*dir}px)`;
  });
});
