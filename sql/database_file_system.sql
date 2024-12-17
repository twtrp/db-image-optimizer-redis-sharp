CREATE DATABASE IF NOT EXISTS redisresearch_file_system;

USE redisresearch_file_system;

CREATE TABLE `images` (
  `id` int(11) NOT NULL,
  `album` int(11) NOT NULL,
  `value` int(11) NOT NULL,
  `image` varchar(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

INSERT INTO `images` (`id`, `album`, `value`, `image`) VALUES
(1, 1, 5940, '1.webp');
INSERT INTO `images` (`id`, `album`, `value`, `image`) VALUES
(2, 1, 7471, '2.webp');
INSERT INTO `images` (`id`, `album`, `value`, `image`) VALUES
(3, 1, 6782, '3.webp');
INSERT INTO `images` (`id`, `album`, `value`, `image`) VALUES
(4, 1, 9724, '4.webp');
INSERT INTO `images` (`id`, `album`, `value`, `image`) VALUES
(5, 1, 4029, '5.webp');
INSERT INTO `images`(`id`, `album`, `value`, `image`) VALUES
(6, 1, 4172, '6.webp');
INSERT INTO `images` (`id`, `album`, `value`, `image`) VALUES
(7, 1, 4266, '7.webp');
INSERT INTO `images` (`id`, `album`, `value`, `image`) VALUES
(8, 1, 1855, '8.webp');
INSERT INTO `images` (`id`, `album`, `value`, `image`) VALUES
(9, 1, 7757, '9.webp');
INSERT INTO `images` (`id`, `album`, `value`, `image`) VALUES
(10, 1, 8511, '10.webp');
INSERT INTO `images` (`id`, `album`, `value`, `image`) VALUES
(11, 1, 7579, '11.webp');
INSERT INTO `images` (`id`, `album`, `value`, `image`) VALUES
(12, 1, 345, '12.webp');
INSERT INTO `images` (`id`, `album`, `value`, `image`) VALUES
(13, 1, 9579, '13.webp');
INSERT INTO `images` (`id`, `album`, `value`, `image`) VALUES
(14, 1, 7166, '14.webp');
INSERT INTO `images` (`id`, `album`, `value`, `image`) VALUES
(15, 1, 115, '15.webp');
INSERT INTO `images` (`id`, `album`, `value`, `image`) VALUES
(16, 2, 7426, '16.webp');
INSERT INTO `images` (`id`, `album`, `value`, `image`) VALUES
(17, 2, 508, '17.webp');
INSERT INTO `images` (`id`, `album`, `value`, `image`) VALUES
(18, 2, 5766, '18.webp');
INSERT INTO `images` (`id`, `album`, `value`, `image`) VALUES
(19, 2, 7297, '19.webp');
INSERT INTO `images` (`id`, `album`, `value`, `image`) VALUES
(20, 2, 948, '20.webp');
INSERT INTO `images` (`id`, `album`, `value`, `image`) VALUES
(21, 2, 5881, '21.webp');
INSERT INTO `images` (`id`, `album`, `value`, `image`) VALUES
(22, 2, 3583, '22.webp');
INSERT INTO `images` (`id`, `album`, `value`, `image`) VALUES
(23, 2, 712, '23.webp');
INSERT INTO `images` (`id`, `album`, `value`, `image`) VALUES
(24, 2, 5403, '24.webp');
INSERT INTO `images` (`id`, `album`, `value`, `image`) VALUES
(25, 2, 4594, '25.webp');
INSERT INTO `images` (`id`, `album`, `value`, `image`) VALUES
(26, 2, 1022, '26.webp');
INSERT INTO `images` (`id`, `album`, `value`, `image`) VALUES
(27, 2, 9474, '27.webp');
INSERT INTO `images` (`id`, `album`, `value`, `image`) VALUES
(28, 2, 4948, '28.webp');
INSERT INTO `images` (`id`, `album`, `value`, `image`) VALUES
(29, 2, 3234, '29.webp');
INSERT INTO `images` (`id`, `album`, `value`, `image`) VALUES
(30, 2, 7264, '30.webp');

COMMIT;