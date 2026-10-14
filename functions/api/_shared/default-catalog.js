import bookData from '../../../cms/data/books.json';
import productData from '../../../cms/data/products.json';

const publishedSlugs = new Set([
  'book-saju-story',
  'book-wangchobo',
  'book-jireumgil',
  'book-jireumgil-middle',
  'book-jireumgil-lower',
]);

export const defaultCatalog = bookData.items
  .filter(book => publishedSlugs.has(book.slug))
  .map(book => {
    const product = productData.items.find(item => item.book_slugs?.includes(book.slug));
    return {
      slug: book.slug,
      title: book.title,
      author: book.author,
      description: book.description || '',
      series: book.series || '',
      cover: book.image || '',
      video_url: book.video_url || '',
      published: book.status === '출간',
      price: product?.price || '',
      regular_price: product?.regular_price || '',
      status: product?.status || '준비중',
      purchase_url: product?.purchase_url || '',
    };
  });
